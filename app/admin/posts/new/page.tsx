import Link from "next/link";
import { createPost } from "@/app/admin/posts/actions";
import { PostForm } from "@/app/admin/posts/post-form";
import { getOwnerPostEventOptions } from "@/lib/posts/data";
import { requireJournalOwner } from "@/lib/supabase/authorization";

export default async function NewPostPage() {
  const owner = await requireJournalOwner();
  const { data: events, error } = await getOwnerPostEventOptions(owner.id);

  return (
    <main className="admin-content">
      <Link className="back-link" href="/admin/posts">← All posts</Link>
      <p className="eyebrow">Your journal</p>
      <h1>New post</h1>
      <p className="admin-lede">Write and format an entry, then choose whether to publish it.</p>
      <PostForm
        action={createPost}
        eventLoadError={Boolean(error)}
        events={events ?? []}
        submitLabel="Create post"
      />
    </main>
  );
}
