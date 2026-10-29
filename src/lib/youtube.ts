/**
 * Vidéo YouTube d'un événement publié dans Claudy (`video_url`).
 *
 * Même façade que les vidéos du Markdown (src/plugins/rehype-youtube.ts) :
 * une vignette locale et un bouton lecture, l'iframe youtube-nocookie.com
 * n'est créée qu'au clic (script `data-yt`, BaseLayout). La vignette vient de
 * i.ytimg.com et passe par `claudyImage` : téléchargée et convertie au build,
 * jamais hotlinkée. Si elle manque, la fiche donne un simple lien vers YouTube.
 */
import { claudyImage, type RemoteImage } from "@lib/remote-image";

const YOUTUBE_ID =
  /^https?:\/\/(?:(?:www|m)\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})(?:[?&#/].*)?$/;

/** L'identifiant YouTube (11 caractères) d'un lien, ou `undefined`. */
export function youtubeId(url: string | undefined): string | undefined {
  return url?.trim().match(YOUTUBE_ID)?.[1];
}

export interface YoutubeVideo {
  id: string;
  /** Page de la vidéo sur YouTube : la cible du lien sans JavaScript. */
  watchUrl: string;
  /** Lecteur chargé au clic, sans cookie, lancé d'office. */
  embedUrl: string;
  thumbnail?: RemoteImage;
}

/** La vidéo d'un lien YouTube, vignette rapatriée au build ; `undefined` si le lien n'est pas YouTube. */
export async function youtubeVideo(url: string | undefined): Promise<YoutubeVideo | undefined> {
  const id = youtubeId(url);
  if (!id) return undefined;
  let thumbnail: RemoteImage | undefined;
  // `maxresdefault` manque sur les vidéos anciennes ou peu définies : on descend.
  for (const size of ["maxresdefault", "sddefault", "hqdefault"]) {
    thumbnail = await claudyImage(`https://i.ytimg.com/vi/${id}/${size}.jpg`, [640, 960]);
    if (thumbnail) break;
  }
  return {
    id,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`,
    thumbnail,
  };
}
