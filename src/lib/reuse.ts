import { artifactKindLabels, type Artifact } from "@/data/artifacts";
import type { MediaItem } from "@/data/media";
import type { ChipRef } from "@/data/mentions";

export function artifactToChip(artifact: Artifact): ChipRef {
  return {
    id: `artifact:${artifact.id}`,
    kind: "artifact",
    label: artifact.name,
    description: `${artifactKindLabels[artifact.kind]} · ${artifact.folderId} · ${artifact.frames} frames`,
    artifact: {
      id: artifact.id,
      source: "design",
      type: artifact.kind,
      folderId: artifact.folderId,
      frames: artifact.frames,
      background: artifact.preview,
    },
  };
}

export function mediaToChip(media: MediaItem): ChipRef {
  return {
    id: `artifact:media:${media.id}`,
    kind: "artifact",
    label: media.title,
    description: `Video · ${media.resolution} · ${media.duration}`,
    artifact: {
      id: media.id,
      source: "media",
      type: "video",
      poster: media.poster || undefined,
      url: media.video,
    },
  };
}