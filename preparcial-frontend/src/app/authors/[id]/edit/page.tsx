"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Author = {
  id: number;
  name: string;
  description: string;
  birthDate: string;
  image: string;
};

// Helpers ETag
function normalizeETag(raw: string | null): string | null {
  if (!raw) return null;
  let tag = raw.trim();
  if (tag.startsWith("W/")) tag = tag.slice(2);
  if (!tag.startsWith(`"`)) tag = `"${tag.replaceAll(`"`, "")}"`;
  return tag;
}
async function fetchETag(path: string): Promise<string | null> {
  let res = await fetch(path, { method: "HEAD", cache: "no-store" });
  if (!res.ok) {
    res = await fetch(path, { method: "GET", cache: "no-store" });
    if (!res.ok) return null;
  }
  return normalizeETag(res.headers.get("ETag"));
}

export default function EditAuthorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [author, setAuthor] = useState<Author | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/authors/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudo cargar el autor");
        const data: Author = await res.json();
        setAuthor(data);
        setEtag(normalizeETag(res.headers.get("ETag")));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error cargando autor");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!author) return;
    try {
      setBusy(true);
      // si por alguna razón perdimos el ETag, lo pedimos
      const match = etag ?? (await fetchETag(`/api/authors/${author.id}`)) ?? "*";
      const res = await fetch(`/api/authors/${author.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "If-Match": match },
        body: JSON.stringify(author),
      });
      if (!res.ok) throw new Error(`No se pudo actualizar (HTTP ${res.status})`);
      router.push("/authors");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error actualizando autor");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p>Cargando…</p>;
  if (err) return <p className="text-red-600">{err}</p>;
  if (!author) return <p>No se encontró el autor.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Editar autor</h1>
      <form onSubmit={handleSubmit} className="grid gap-3 max-w-md">
        <input className="border p-2" value={author.name}
               onChange={(e) => setAuthor({ ...author, name: e.target.value })} />
        <input className="border p-2" value={author.birthDate}
               onChange={(e) => setAuthor({ ...author, birthDate: e.target.value })} />
        <input className="border p-2" value={author.image}
               onChange={(e) => setAuthor({ ...author, image: e.target.value })} />
        <textarea className="border p-2" value={author.description}
                  onChange={(e) => setAuthor({ ...author, description: e.target.value })} />
        <div className="flex gap-2">
          <button disabled={busy} className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-60">
            {busy ? "Guardando…" : "Guardar"}
          </button>
          <a href="/authors" className="px-4 py-2 border rounded">Cancelar</a>
        </div>
      </form>
    </div>
  );
}
