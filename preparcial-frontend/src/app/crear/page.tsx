"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type AuthorInput = {
  name: string;
  description: string;
  birthDate: string; // yyyy-mm-dd
  image: string;
};

export default function CrearAutor() {
  const router = useRouter();
  const [form, setForm] = useState<AuthorInput>({
    name: "", description: "", birthDate: "", image: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const change =
    (k: keyof AuthorInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      setBusy(true);
      const res = await fetch("/api/authors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push("/authors"); // vuelve a la lista
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error creando autor");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Crear autor</h1>
      <form onSubmit={submit} className="grid gap-3 max-w-md">
        <input className="border p-2" placeholder="Nombre" value={form.name} onChange={change("name")} required />
        <input className="border p-2" placeholder="Fecha (yyyy-mm-dd)" value={form.birthDate} onChange={change("birthDate")} required />
        <input className="border p-2" placeholder="URL Imagen" value={form.image} onChange={change("image")} required />
        <textarea className="border p-2" placeholder="Descripción" value={form.description} onChange={change("description")} required />
        {err && <p className="text-red-600">{err}</p>}
        <div className="flex gap-2">
          <button disabled={busy} className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-60">
            {busy ? "Guardando…" : "Guardar"}
          </button>
          <a href="/authors" className="px-4 py-2 border rounded">Cancelar</a>
        </div>
      </form>
    </div>
  );
}
