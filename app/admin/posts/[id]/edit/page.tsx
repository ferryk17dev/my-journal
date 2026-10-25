import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePost } from "@/app/admin/posts/actions";
import { DeletePostForm } from "@/app/admin/posts/delete-post-form";
import { PostForm } from "@/app/admin/posts/post-form";
import { getOwnerPostEventOptions } from "@/lib/posts/data";
import { postIdSchema, type PostFormValues } from "@/lib/posts/validation";
import { requireJournalOwner } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const owner = await requireJournalOwner();
  const { id } = await params;
  const parsedId = postIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const [postResult, eventsResult] = await Promise.all([
    supabase
      .from("posts")
      .select("id, title, slug, excerpt, content, event_id, status, visibility")
      .eq("id", parsedId.data)
      .eq("user_id", owner.id)
      .maybeSingle(),
    getOwnerPostEventOptions(owner.id),
  ]);

  if (postResult.error || eventsResult.error) {
    return (
      <main className="admin-content">
        <p className="form-message" role="alert">
          This post or its event options couldn’t be loaded. Return to the posts list and try again.
        </p>
        <Link className="button-secondary" href="/admin/posts">Back to posts</Link>
      </main>
    );
  }
  if (!postResult.data) notFound();

  const post = postResult.data;
  const initialValues: PostFormValues = {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt ?? "",
    content: JSON.stringify(post.content),
    event_id: post.event_id ?? "",
    status: post.status,
    visibility: post.visibility,
  };
  const updateThisPost = updatePost.bind(null, post.id);

  return (
    <main className="admin-content">
      <Link className="back-link" href="/admin/posts">← All posts</Link>
      <p className="eyebrow">Your journal</p>
      <h1>Edit post</h1>
      <p className="admin-lede">Update “{post.title}”, its event association, and publishing settings.</p>
      <PostForm
        action={updateThisPost}
        events={eventsResult.data}
        initialValues={initialValues}
        postId={post.id}
        submitLabel="Save changes"
      />
      <section className="edit-delete-section" aria-labelledby="delete-post-heading">
        <h2 id="delete-post-heading">Delete post</h2>
        <p>Deleting the post also removes its stored images. If image cleanup fails, the post is kept so you can retry.</p>
        <DeletePostForm
          cancelHref={`/admin/posts/${post.id}/edit`}
          postId={post.id}
          postTitle={post.title}
        />
      </section>
    </main>
  );
}
