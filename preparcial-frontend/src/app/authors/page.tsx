"use client";
import { useEffect, useState } from "react";

/** Tipos del backend (mínimos y flexibles) */
type BookLite = { id: number; name?: string };
type PrizeLite = { id: number; name?: string };

type Author = {
  id: number;
  name: string;
  description: string;
  birthDate: string;
  image: string;
  books?: BookLite[];
  prizes?: PrizeLite[];
};

/** Para describir cómo vienen los JSON de libro/premio cuando hacemos GET */
type AuthorRef = { id: number; name?: string };

/** Libro real (GET /api/books/{id}) con variantes comunes de modelado */
type BookEntity = {
  id: number;
  name?: string;
  // variantes posibles de relación con autor
  author?: AuthorRef | null;
  authorId?: number | null;
  authors?: AuthorRef[]; // muchos-a-muchos
  // otros campos que no nos interesan…
  [k: string]: unknown;
};

/** Premio real (GET /api/prizes/{id}) con variantes comunes de modelado */
type PrizeEntity = {
  id: number;
  name?: string;
  // variantes posibles de relación con autor
  author?: AuthorRef | null;
  authorId?: number | null;
  authors?: AuthorRef[];
  // otros campos que no nos interesan…
  [k: string]: unknown;
};

/* ---------------- ETag helpers ---------------- */
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

/* ---------------- Utilidad PUT genérica con If-Match ---------------- */
async function updateJsonWithETag<T extends { [k: string]: unknown }>(
  path: string,
  mutate: (json: T) => T
): Promise<Response> {
  // 1) trae recurso + etag
  const resGet = await fetch(path, { method: "GET", cache: "no-store" });
  if (!resGet.ok) throw new Error(`GET ${path}: HTTP ${resGet.status}`);
  const current: T = (await resGet.json()) as T;
  const etag = normalizeETag(resGet.headers.get("ETag"));

  // 2) genera payload mutado (copia defensiva)
  const payload = mutate(structuredClone(current));

  // 3) PUT con If-Match
  const resPut = await fetch(path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": etag ?? "*",
    },
    body: JSON.stringify(payload),
  });
  return resPut;
}

/* ---------------- Desasociar y borrar BOOK ---------------- */
async function detachAuthorAndDeleteBook(bookId: number): Promise<void> {
  const path = `/api/books/${bookId}`;

  // Intentos de PUT para “quitar” el autor, probando distintos modelos
  const attempts: Array<(json: BookEntity) => BookEntity> = [
    // 1) author = null y/o authorId = null
    (json) => {
      json.author = null;
      if ("authorId" in json) json.authorId = null;
      return json;
    },
    // 2) eliminar la propiedad author y/o authorId
    (json) => {
      delete json.author;
      if ("authorId" in json) json.authorId = null;
      return json;
    },
    // 3) si el libro tiene authors (muchos-a-muchos)
    (json) => {
      if (Array.isArray(json.authors)) json.authors = [];
      delete json.author;
      if ("authorId" in json) json.authorId = null;
      return json;
    },
  ];

  for (const mutate of attempts) {
    const res = await updateJsonWithETag<BookEntity>(path, mutate);
    if (res.ok) break; // con un PUT ok seguimos al delete; si no, probamos otro intento
  }

  // DELETE del libro (con ETag fresco si existe)
  const resDel = await fetch(path, {
    method: "DELETE",
    headers: { "If-Match": (await fetchETag(path)) ?? "*" },
  });
  if (!resDel.ok) {
    const msg = await resDel.text().catch(() => "");
    throw new Error(`DELETE ${path}: HTTP ${resDel.status} ${msg}`);
  }
}

/* ---------------- Desasociar y borrar PRIZE ---------------- */
async function detachAuthorAndDeletePrize(prizeId: number): Promise<void> {
  const path = `/api/prizes/${prizeId}`;

  const attempts: Array<(json: PrizeEntity) => PrizeEntity> = [
    // 1) author = null y/o authorId = null
    (json) => {
      json.author = null;
      if ("authorId" in json) json.authorId = null;
      return json;
    },
    // 2) eliminar author y/o authorId
    (json) => {
      delete json.author;
      if ("authorId" in json) json.authorId = null;
      return json;
    },
    // 3) authors vacío (por si el modelo es muchos-a-muchos)
    (json) => {
      if (Array.isArray(json.authors)) json.authors = [];
      delete json.author;
      if ("authorId" in json) json.authorId = null;
      return json;
    },
  ];

  for (const mutate of attempts) {
    const res = await updateJsonWithETag<PrizeEntity>(path, mutate);
    if (res.ok) break;
  }

  const resDel = await fetch(path, {
    method: "DELETE",
    headers: { "If-Match": (await fetchETag(path)) ?? "*" },
  });
  if (!resDel.ok) {
    const msg = await resDel.text().catch(() => "");
    throw new Error(`DELETE ${path}: HTTP ${resDel.status} ${msg}`);
  }
}

/* ---------------- Flujo de borrado de AUTOR ---------------- */
async function deleteAuthorAggressive(authorId: number) {
  // 1) trae autor con relaciones
  const res = await fetch(`/api/authors/${authorId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Autor: HTTP ${res.status}`);
  const author: Author = (await res.json()) as Author;
  const authorETag = normalizeETag(res.headers.get("ETag"));

  // 2) borrar PRIZES (desasociando por PUT antes)
  const prizes = Array.isArray(author.prizes) ? author.prizes : [];
  for (const p of prizes) {
    await detachAuthorAndDeletePrize(p.id);
  }

  // 3) borrar BOOKS (desasociando por PUT antes)
  const books = Array.isArray(author.books) ? author.books : [];
  for (const b of books) {
    await detachAuthorAndDeleteBook(b.id);
  }

  // 4) por último, borrar el autor
  const resDel = await fetch(`/api/authors/${authorId}`, {
    method: "DELETE",
    headers: { "If-Match": authorETag ?? "*" },
  });
  if (!resDel.ok) {
    const msg = await resDel.text().catch(() => "");
    throw new Error(`DELETE /api/authors/${authorId}: HTTP ${resDel.status} ${msg}`);
  }
}

/* ---------------- Página ---------------- */
export default function AuthorsPage() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Cargar lista
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch("/api/authors", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Author[] = (await res.json()) as Author[];
        setAuthors(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error cargando autores");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      setDeletingId(id);
      await deleteAuthorAggressive(id);
      setAuthors(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error eliminando autor");
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) return <p>Cargando…</p>;
  if (err) return <p className="text-red-600">{err}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Autores</h1>
        <a href="/crear" className="px-3 py-2 border rounded">➕ Crear autor</a>
      </div>

      <ul className="grid gap-3">
        {authors.map((a) => (
          <li key={a.id} className="p-4 border rounded flex items-start gap-3">
            {a.image && <img src={a.image} alt={a.name} className="w-16 h-16 object-cover rounded" />}
            <div className="flex-1">
              <p className="font-semibold">{a.name}</p>
              <p className="text-sm opacity-80">{a.description}</p>
              <p className="text-xs opacity-60">Nacimiento: {a.birthDate}</p>
              {Array.isArray(a.books) && a.books.length > 0 && (
                <p className="text-xs opacity-60 mt-1">Libros asociados: {a.books.length}</p>
              )}
              {Array.isArray(a.prizes) && a.prizes.length > 0 && (
                <p className="text-xs opacity-60">Premios asociados: {a.prizes.length}</p>
              )}
            </div>
            <div className="flex gap-2">
              <a href={`/authors/${a.id}/edit`} className="px-3 py-1 border rounded">Editar</a>
              <button
                onClick={() => handleDelete(a.id)}
                className="px-3 py-1 border rounded text-red-500 disabled:opacity-50"
                disabled={deletingId === a.id}
                title={deletingId === a.id ? "Eliminando…" : "Eliminar"}
              >
                {deletingId === a.id ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
