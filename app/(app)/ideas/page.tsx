import { format } from "date-fns";

import { IdeaDialog } from "@/components/ideas/idea-dialog";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const session = await getSession();
  if (!session) {
    return null;
  }

  const person = await db.person.findUnique({
    where: { id: session.personId },
    select: { isAdmin: true },
  });
  if (!person) {
    return null;
  }

  const isAdmin = person.isAdmin;
  const ideas = await db.idea.findMany({
    where: {
      isDemo: session.isDemo,
      ...(isAdmin ? {} : { authorId: session.personId }),
    },
    include: { author: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ideas</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? `${ideas.length} idea${ideas.length === 1 ? "" : "s"} submitted by the team.`
              : `${ideas.length} idea${ideas.length === 1 ? "" : "s"} you've submitted — they go straight to Mustafa.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Button asChild size="sm" variant="outline">
              <a href="/api/ideas/export">Export CSV</a>
            </Button>
          ) : null}
          <IdeaDialog
            trigger={<Button size="sm">Submit your ideas</Button>}
          />
        </div>
      </header>

      {ideas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            No ideas yet — be the first.
          </p>
          <p className="text-sm text-muted-foreground">
            Suggest a feature, flag a problem, or share feedback with the team.
          </p>
          <IdeaDialog
            trigger={
              <Button size="sm" className="mt-2">
                Submit your ideas
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="rounded-lg border border-border px-4 py-3"
            >
              <p className="text-sm text-foreground">{idea.text}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {isAdmin ? `${idea.author.name} · ` : ""}
                {format(idea.createdAt, "MMM d, yyyy")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
