"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, KeyRound, LogOut, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { createPerson, logout } from "@/lib/actions/people";
import { IdeaDialog } from "@/components/ideas/idea-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PAGE_TITLES: Record<string, string> = {
  "/projects": "Projects",
  "/board": "Board",
  "/timeline": "Timeline",
  "/ideas": "Ideas",
  "/archived": "Archived",
  "/changelog": "Changelog",
};

function titleForPath(pathname: string): string {
  const match = Object.keys(PAGE_TITLES).find(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return match ? PAGE_TITLES[match] : "ctcHealth Command Center";
}

function initialsFor(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type CreatedUser = {
  name: string;
  temporaryPassword: string;
};

function AddUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setName("");
      setCreatedUser(null);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    startTransition(async () => {
      const result = await createPerson(name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setCreatedUser({
        name: result.data.name,
        temporaryPassword: result.data.temporaryPassword,
      });
      toast.success("User added.");
    });
  }

  async function copyPassword() {
    if (!createdUser) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdUser.temporaryPassword);
      toast.success("Temporary password copied.");
    } catch {
      toast.error("Could not copy the password.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Create a login and share its temporary password out-of-band.
          </DialogDescription>
        </DialogHeader>

        {createdUser ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium text-foreground">
                {createdUser.name}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 select-all rounded-md bg-background px-2.5 py-2 font-mono text-sm ring-1 ring-border">
                  {createdUser.temporaryPassword}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Copy temporary password"
                  onClick={copyPassword}
                >
                  <Copy />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Save it now — it won&apos;t be shown again after you close this
              dialog.
            </p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-name">Name</Label>
              <Input
                id="new-user-name"
                autoFocus
                required
                maxLength={100}
                autoComplete="off"
                placeholder="Full name"
                value={name}
                disabled={isPending}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || !name.trim()}
              >
                {isPending ? "Adding user…" : "Add user"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function Topbar({
  userName,
  isAdmin,
}: {
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
      <h1 className="min-w-0 truncate text-sm font-medium text-foreground">
        {titleForPath(pathname)}
      </h1>

      <div className="flex shrink-0 items-center gap-3">
        <IdeaDialog
          trigger={
            <Button variant="outline" size="sm">
              Submit your ideas
            </Button>
          }
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 px-1.5"
              disabled={isPending}
            >
              <Avatar size="sm">
                <AvatarFallback>{initialsFor(userName)}</AvatarFallback>
              </Avatar>
              <span className="max-w-[10rem] truncate text-sm text-foreground">
                {userName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => router.push("/login/change-password")}
            >
              <KeyRound data-icon="inline-start" />
              Change password
            </DropdownMenuItem>
            {isAdmin ? (
              <DropdownMenuItem onSelect={() => setAddUserOpen(true)}>
                <UserPlus data-icon="inline-start" />
                Add user
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isPending}
              onSelect={() => startTransition(() => logout())}
            >
              <LogOut data-icon="inline-start" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {isAdmin ? (
          <AddUserDialog open={addUserOpen} onOpenChange={setAddUserOpen} />
        ) : null}
      </div>
    </header>
  );
}
