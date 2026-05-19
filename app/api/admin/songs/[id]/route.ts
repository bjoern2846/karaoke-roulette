import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Song } from "../../../../data/songs";

const SONGS_PATH = join(process.cwd(), "app/data/songs.json");

function readSongs(): Song[] {
  return JSON.parse(readFileSync(SONGS_PATH, "utf-8")) as Song[];
}

function writeSongs(songs: Song[]): void {
  writeFileSync(SONGS_PATH, JSON.stringify(songs, null, 2), "utf-8");
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const updated = await req.json() as Song;
  const songs = readSongs();
  const idx = songs.findIndex((s) => s.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  songs[idx] = { ...updated, id };
  writeSongs(songs);
  return NextResponse.json(songs[idx]);
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const songs = readSongs();
  writeSongs(songs.filter((s) => s.id !== id));
  return NextResponse.json({ ok: true });
}
