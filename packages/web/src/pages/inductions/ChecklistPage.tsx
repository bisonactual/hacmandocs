import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../hooks/useAuth";

interface ChecklistItem { id: string; itemText: string; sortOrder: number; }
interface ChecklistSection { id: string; sectionTitle: string; sortOrder: number; items: ChecklistItem[]; }
interface ChecklistData { tool: { id: string; name: string }; sections: ChecklistSection[]; }

export default function ChecklistPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<ChecklistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionTitle, setEditSectionTitle] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemText, setEditItemText] = useState("");

  const load = () => {
    if (!toolId) return;
    setLoading(true);
    apiFetch<ChecklistData>(`/api/inductions/checklists/${toolId}`)
      .then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [toolId]);

  const canEdit = user?.permissionLevel === "Admin" || true;

  const addSection = async () => {
    if (!newSectionTitle.trim() || !toolId) return;
    setError("");
    try {
      await apiFetch(`/api/inductions/checklists/${toolId}`, { method: "POST", body: JSON.stringify({ sectionTitle: newSectionTitle, sortOrder: (data?.sections.length ?? 0) }) });
      setNewSectionTitle(""); load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };

  const updateSection = async (sectionId: string) => {
    if (!editSectionTitle.trim()) return; setError("");
    try { await apiFetch(`/api/inductions/checklists/sections/${sectionId}`, { method: "PUT", body: JSON.stringify({ sectionTitle: editSectionTitle }) }); setEditingSectionId(null); load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };
  const deleteSection = async (sectionId: string) => {
    if (!confirm("Delete this section and all its items?")) return;
    try { await apiFetch(`/api/inductions/checklists/sections/${sectionId}`, { method: "DELETE" }); load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };
  const addItem = async (sectionId: string) => {
    const text = newItemText[sectionId]?.trim(); if (!text) return; setError("");
    try { const section = data?.sections.find((s) => s.id === sectionId);
      await apiFetch(`/api/inductions/checklists/sections/${sectionId}/items`, { method: "POST", body: JSON.stringify({ itemText: text, sortOrder: section?.items.length ?? 0 }) });
      setNewItemText((prev) => ({ ...prev, [sectionId]: "" })); load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };
  const updateItem = async (itemId: string) => {
    if (!editItemText.trim()) return; setError("");
    try { await apiFetch(`/api/inductions/checklists/items/${itemId}`, { method: "PUT", body: JSON.stringify({ itemText: editItemText }) }); setEditingItemId(null); load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };
  const deleteItem = async (itemId: string) => {
    if (!confirm("Delete this item?")) return;
    try { await apiFetch(`/api/inductions/checklists/items/${itemId}`, { method: "DELETE" }); load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" /></div>;
  if (error && !data) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 print:max-w-none print:p-0" data-print-area>
      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-xl font-semibold text-white">{data.tool.name} — Induction Checklist</h2>
        <div className="flex gap-2">
          {canEdit && (
            <button onClick={() => setEditing(!editing)}
              className={`rounded-lg px-4 py-2 text-sm transition-colors ${editing ? "bg-hacman-gray text-gray-300" : "border border-hacman-gray text-gray-400 hover:border-hacman-yellow hover:text-hacman-yellow"}`}>
              {editing ? "Done Editing" : "Edit"}
            </button>
          )}
          <button onClick={() => window.print()} className="rounded-lg bg-hacman-yellow px-4 py-2 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors">Print</button>
        </div>
      </div>

      <div className="hidden print:block text-center mb-6">
        <h1 className="text-2xl font-bold">{data.tool.name}</h1>
        <p className="text-sm text-gray-500">Induction Checklist</p>
      </div>

      {error && <p className="text-sm text-red-400 print:hidden">{error}</p>}

      {data.sections.length === 0 && !editing ? (
        <p className="text-hacman-muted text-sm">No checklist sections have been created for this tool yet.</p>
      ) : (
        data.sections.map((section) => (
          <div key={section.id} className="rounded-xl border border-hacman-gray overflow-hidden print:border-black">
            <div className="bg-hacman-gray/50 px-4 py-2 flex items-center justify-between print:bg-gray-200">
              {editingSectionId === section.id ? (
                <div className="flex items-center gap-2 print:hidden">
                  <input value={editSectionTitle} onChange={(e) => setEditSectionTitle(e.target.value)}
                    className="rounded-md border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200" />
                  <button onClick={() => updateSection(section.id)} className="text-xs text-hacman-yellow hover:underline">Save</button>
                  <button onClick={() => setEditingSectionId(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                </div>
              ) : (
                <span className="font-medium text-gray-200">{section.sectionTitle}</span>
              )}
              {editing && editingSectionId !== section.id && (
                <div className="flex gap-2 print:hidden">
                  <button onClick={() => { setEditingSectionId(section.id); setEditSectionTitle(section.sectionTitle); }}
                    className="text-xs text-hacman-yellow hover:underline">Rename</button>
                  <button onClick={() => deleteSection(section.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                </div>
              )}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {section.items.map((item) => (
                  <tr key={item.id} className="border-t border-hacman-gray/50 print:border-gray-300">
                    <td className="px-4 py-2 text-gray-300">
                      {editingItemId === item.id ? (
                        <div className="flex items-center gap-2 print:hidden">
                          <input value={editItemText} onChange={(e) => setEditItemText(e.target.value)}
                            className="flex-1 rounded-md border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200" />
                          <button onClick={() => updateItem(item.id)} className="text-xs text-hacman-yellow hover:underline">Save</button>
                          <button onClick={() => setEditingItemId(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                        </div>
                      ) : <span>{item.itemText}</span>}
                    </td>
                    <td className="w-16 px-4 py-2 text-center print:block">
                      <span className="inline-block h-4 w-4 border border-hacman-gray print:border-black" />
                    </td>
                    {editing && editingItemId !== item.id && (
                      <td className="w-24 px-2 py-2 print:hidden">
                        <button onClick={() => { setEditingItemId(item.id); setEditItemText(item.itemText); }}
                          className="text-xs text-hacman-yellow hover:underline mr-2">Edit</button>
                        <button onClick={() => deleteItem(item.id)} className="text-xs text-red-400 hover:underline">Del</button>
                      </td>
                    )}
                  </tr>
                ))}
                {section.items.length === 0 && !editing && (
                  <tr><td colSpan={2} className="px-4 py-2 text-hacman-muted text-center">No items in this section.</td></tr>
                )}
                {editing && (
                  <tr className="print:hidden">
                    <td colSpan={3} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <input placeholder="New item…" value={newItemText[section.id] ?? ""}
                          onChange={(e) => setNewItemText((prev) => ({ ...prev, [section.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(section.id); } }}
                          className="flex-1 rounded-md border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted" />
                        <button onClick={() => addItem(section.id)} className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 transition-colors">Add</button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))
      )}

      {editing && (
        <div className="flex items-center gap-2 print:hidden">
          <input placeholder="New section title…" value={newSectionTitle} onChange={(e) => setNewSectionTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSection(); } }}
            className="flex-1 rounded-md border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted" />
          <button onClick={addSection} className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark transition-colors">Add Section</button>
        </div>
      )}

      <div className="hidden print:block mt-8 space-y-6">
        <p className="text-sm text-gray-600 italic">You only need to complete this section if unable to use our electronic signing system.</p>
        <div className="flex gap-8">
          <div className="flex-1 border-t border-black pt-1 text-sm">Trainer Signature</div>
          <div className="flex-1 border-t border-black pt-1 text-sm">Date</div>
        </div>
        <div className="flex gap-8">
          <div className="flex-1 border-t border-black pt-1 text-sm">Inductee Signature</div>
          <div className="flex-1 border-t border-black pt-1 text-sm">Date</div>
        </div>
      </div>
    </div>
  );
}
