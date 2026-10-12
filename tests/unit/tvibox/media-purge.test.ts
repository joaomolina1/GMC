import { describe, expect, it } from "vitest";
import {
  episodeMediaPaths,
  episodeNumberFromName,
  isSeriesPosterName,
  orphanPaths,
  pathsForEpisode,
  publicObjectPath,
  removeStoragePaths,
  seriesMediaPaths,
  type StorageBucketApi,
} from "@lib/tvibox/media-purge";

describe("nomes de episódio", () => {
  it("reconhece vídeo, poster, legendas e argumento sem confundir ep1 com ep10", () => {
    expect(episodeNumberFromName("ep1-final.mp4")).toBe(1);
    expect(episodeNumberFromName("ep1-animatic.mp4")).toBe(1);
    expect(episodeNumberFromName("ep21-poster.jpg")).toBe(21);
    expect(episodeNumberFromName("ep21.pt.vtt")).toBe(21);
    expect(episodeNumberFromName("ep21.script.vtt")).toBe(21);
    expect(episodeNumberFromName("ep12-mf3k.mp4")).toBe(12);
    expect(episodeNumberFromName("ep10-final.mp4")).not.toBe(1);
    expect(episodeNumberFromName("ep120-final.mp4")).not.toBe(12);
    expect(episodeNumberFromName("readme.txt")).toBeNull();
  });

  it("filtra só os ficheiros daquele número", () => {
    const paths = [
      "episodes/galo/ep1-final.mp4",
      "episodes/galo/ep10-final.mp4",
      "episodes/galo/ep1.pt.vtt",
      "work/galo/ep1-step-07.mp4",
      "work/outro/ep1-final.mp4",
    ];
    expect(pathsForEpisode(paths, "galo", 1)).toEqual([
      "episodes/galo/ep1-final.mp4",
      "episodes/galo/ep1.pt.vtt",
      "work/galo/ep1-step-07.mp4",
    ]);
  });
});

describe("posters e URLs", () => {
  it("não trata o poster de amor-seguro como poster de amor", () => {
    expect(isSeriesPosterName("amor.jpg", "amor")).toBe(true);
    expect(isSeriesPosterName("amor-seguro.jpg", "amor")).toBe(false);
    expect(isSeriesPosterName("amor-seguro.jpg", "amor-seguro")).toBe(true);
    expect(isSeriesPosterName("amor-seguro-mf3k12ab.jpg", "amor-seguro")).toBe(true);
    expect(isSeriesPosterName("amor-2.jpg", "amor")).toBe(false);
  });

  it("extrai o caminho de um URL público", () => {
    const url = "https://wnhojvxnamxmpmdislcl.supabase.co/storage/v1/object/public/tvibox/episodes/amor-seguro/ep1-final.mp4";
    expect(publicObjectPath(url)).toBe("episodes/amor-seguro/ep1-final.mp4");
    expect(publicObjectPath(null)).toBeNull();
    expect(publicObjectPath("https://example.com/video.mp4")).toBeNull();
  });
});

describe("órfãos", () => {
  it("apaga episódios que já não estão na base e mantém o resto", () => {
    const paths = [
      "episodes/amor-seguro/ep20-final.mp4",
      "episodes/amor-seguro/ep20-poster.jpg",
      "episodes/amor-seguro/ep20.pt.vtt",
      "episodes/amor-seguro/ep21-final.mp4",
      "episodes/galo-barcelos/ep18-final.mp4",
      "episodes/galo-barcelos/ep19-final.mp4",
      "work/sangue/ep1-step-07.mp4",
      "posters/amor-seguro.jpg",
      "posters/serie-apagada.jpg",
    ];
    const live = [
      { slug: "amor-seguro", number: 20 },
      { slug: "galo-barcelos", number: 18 },
      { slug: "sangue", number: 1 },
    ];
    expect(orphanPaths(paths, live, ["amor-seguro", "galo-barcelos", "sangue", "mare-alta"])).toEqual([
      "episodes/amor-seguro/ep21-final.mp4",
      "episodes/galo-barcelos/ep19-final.mp4",
      "posters/serie-apagada.jpg",
    ]);
  });
});

function fakeStorage(tree: Record<string, { name: string; id: string | null }[]>): StorageBucketApi & { removed: string[] } {
  const removed: string[] = [];
  const api: StorageBucketApi & { removed: string[] } = {
    removed,
    from: () => ({
      list: async (prefix) => ({ data: tree[prefix] ?? [], error: null }),
      remove: async (paths) => {
        removed.push(...paths);
        return { data: paths.map((name) => ({ name })), error: null };
      },
    }),
  };
  return api;
}

describe("recolha para o botão apagar", () => {
  it("junta ficheiros do episódio, o render intermédio e o URL carregado à mão", async () => {
    const storage = fakeStorage({
      "episodes/sangue": [
        { name: "ep1-final.mp4", id: "a" },
        { name: "ep1.pt.vtt", id: "b" },
        { name: "ep1.script.vtt", id: "c" },
        { name: "ep2-final.mp4", id: "d" },
      ],
      "work/sangue": [{ name: "ep1-step-07.mp4", id: "e" }],
    });
    const url = "https://x.supabase.co/storage/v1/object/public/tvibox/episodes/sangue/ep1-mf3k.mp4";
    const paths = await episodeMediaPaths(storage, "sangue", 1, [url, null, null]);
    expect(paths.sort()).toEqual([
      "episodes/sangue/ep1-final.mp4",
      "episodes/sangue/ep1-mf3k.mp4",
      "episodes/sangue/ep1.pt.vtt",
      "episodes/sangue/ep1.script.vtt",
      "work/sangue/ep1-step-07.mp4",
    ]);
  });

  it("a série leva a pasta, o poster com carimbo e não o poster de outra série", async () => {
    const storage = fakeStorage({
      "episodes/amor": [{ name: "ep1-final.mp4", id: "a" }],
      "work/amor": [],
      posters: [
        { name: "amor.jpg", id: "b" },
        { name: "amor-mf3k12ab.png", id: "c" },
        { name: "amor-seguro.jpg", id: "d" },
      ],
    });
    const paths = await seriesMediaPaths(storage, "amor", [null]);
    expect(paths.sort()).toEqual(["episodes/amor/ep1-final.mp4", "posters/amor-mf3k12ab.png", "posters/amor.jpg"]);
  });

  it("remove em blocos e ignora caminhos vazios", async () => {
    const storage = fakeStorage({});
    const n = await removeStoragePaths(storage, "tvibox", ["a", "a", ""]);
    expect(n).toBe(1);
    expect(storage.removed).toEqual(["a"]);
  });
});
