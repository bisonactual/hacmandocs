import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import type { GroupLevel } from "@hacmandocs/shared";

interface GroupRow {
  id: string;
  name: string;
  groupLevel: GroupLevel;
  members: { userId: string; name: string }[];
  documents: { documentId: string; title: string }[];
}

interface UserOption {
  id: string;
  name: string;
}

interface DocOption {
  id: string;
  title: string;
}

const groupLevels: GroupLevel[] = [
  "Member",
  "Non_Member",
  "Team_Leader",
  "Manager",
  "Board_Member",
];

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState<GroupLevel>("Member");

  const load = () => {
    Promise.all([
      apiFetch<GroupRow[]>("/api/groups"),
      apiFetch<UserOption[]>("/api/users"),
      apiFetch<DocOption[]>("/api/documents"),
    ])
      .then(([g, u, d]) => {
        setGroups(g);
        setUsers(u);
        setDocs(d);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch("/api/groups", {
      method: "POST",
      body: JSON.stringify({
        name: newName,
        groupLevel: newLevel,
      }),
    });
    setNewName("");
    load();
  };

  const deleteGroup = async (id: string) => {
    await apiFetch(`/api/groups/${id}`, { method: "DELETE" });
    load();
  };

  const addMember = async (groupId: string, userId: string) => {
    await apiFetch(`/api/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    load();
  };

  const removeMember = async (groupId: string, userId: string) => {
    await apiFetch(`/api/groups/${groupId}/members/${userId}`, {
      method: "DELETE",
    });
    load();
  };

  const assignDoc = async (groupId: string, documentId: string) => {
    await apiFetch(`/api/groups/${groupId}/documents`, {
      method: "POST",
      body: JSON.stringify({ documentId }),
    });
    load();
  };

  const unassignDoc = async (groupId: string, documentId: string) => {
    await apiFetch(`/api/groups/${groupId}/documents/${documentId}`, {
      method: "DELETE",
    });
    load();
  };

  if (loading) return <p className="text-hacman-muted">Loading groups…</p>;

  return (
    <div className="max-w-2xl">
      <div className="mb-4 rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">Control who can see which documents. Create visibility groups with access levels, assign members, and restrict documents to specific groups.</p>
      </div>

      {/* Create group form */}
      <form onSubmit={createGroup} className="mb-6 flex flex-wrap gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Group name"
          required
          className="rounded-lg border border-hacman-gray bg-hacman-black px-3 py-1.5 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
        />
        <label htmlFor="group-level" className="sr-only">Group level</label>
        <select
          id="group-level"
          value={newLevel}
          onChange={(e) => setNewLevel(e.target.value as GroupLevel)}
          className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1.5 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
        >
          {groupLevels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark"
        >
          Create Group
        </button>
      </form>

      {/* Group list */}
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.id} className="rounded-lg border border-hacman-gray bg-hacman-dark p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-200">{g.name}</span>
                <span className="ml-2 text-xs text-hacman-muted">{g.groupLevel}</span>
              </div>
              <button
                type="button"
                onClick={() => deleteGroup(g.id)}
                className="text-xs text-red-400 hover:underline"
              >
                Delete
              </button>
            </div>

            {/* Members */}
            <div className="mt-3">
              <p className="text-xs font-medium text-hacman-muted">Members</p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {g.members.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center gap-1 rounded-lg bg-hacman-gray px-2 py-0.5 text-xs text-gray-200"
                  >
                    {m.name}
                    <button
                      type="button"
                      onClick={() => removeMember(g.id, m.userId)}
                      className="text-red-400 hover:text-red-300"
                      aria-label={`Remove ${m.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex gap-1">
                <label htmlFor={`add-member-${g.id}`} className="sr-only">Add member</label>
                <select
                  id={`add-member-${g.id}`}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) addMember(g.id, e.target.value);
                    e.target.value = "";
                  }}
                  className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-0.5 text-xs text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
                >
                  <option value="">Add member…</option>
                  {users
                    .filter((u) => !g.members.some((m) => m.userId === u.id))
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              </div>
            </div>

            {/* Documents */}
            <div className="mt-3">
              <p className="text-xs font-medium text-hacman-muted">Documents</p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {g.documents.map((d) => (
                  <li
                    key={d.documentId}
                    className="flex items-center gap-1 rounded-lg bg-hacman-yellow/10 px-2 py-0.5 text-xs text-gray-200"
                  >
                    {d.title}
                    <button
                      type="button"
                      onClick={() => unassignDoc(g.id, d.documentId)}
                      className="text-red-400 hover:text-red-300"
                      aria-label={`Unassign ${d.title}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex gap-1">
                <label htmlFor={`add-doc-${g.id}`} className="sr-only">Assign document</label>
                <select
                  id={`add-doc-${g.id}`}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) assignDoc(g.id, e.target.value);
                    e.target.value = "";
                  }}
                  className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-0.5 text-xs text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
                >
                  <option value="">Assign document…</option>
                  {docs
                    .filter((d) => !g.documents.some((gd) => gd.documentId === d.id))
                    .map((d) => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
