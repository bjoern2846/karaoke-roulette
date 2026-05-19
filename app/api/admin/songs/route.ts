import { NextResponse } from "next/server";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Song } from "../../../data/songs";
import { randomUUID } from "crypto";

const SONGS_PATH = join(process.cwd(), "app/data/songs.json");

function readSongs(): Song[] {
  return JSON.parse(readFileSync(SONGS_PATH, "utf-8")) as Song[];
}

function writeSongs(songs: Song[]): void {
  writeFileSync(SONGS_PATH, JSON.stringify(songs, null, 2), "utf-8");
}

export async function GET() {
  return NextResponse.json(readSongs());
}

export async function POST(req: Request) {
  const body = await req.json() as Omit<Song, "id">;
  const song: Song = { ...body, id: randomUUID() };
  const songs = readSongs();
  songs.push(song);
  writeSongs(songs);
  return NextResponse.json(song, { status: 201 });
}
