export type ArtifactKind = "design" | "skeleton" | "prototype";

export interface Artifact {
  id: string;
  name: string;
  folderId: string;
  kind: ArtifactKind;
  updated: string;
  frames: number;
  tags: string[];
  /** Saved preview surface, shared by the gallery, detail view and inline chip. */
  preview: string;
}

export const artifactKindLabels: Record<ArtifactKind, string> = {
  design: "Design",
  skeleton: "Skeletal design",
  prototype: "Prototype",
};

export const artifactFolders = ["taro", "checkout-flow", "design-tokens", "nike-discovery", "portfolio", "lifemate"];

export const artifacts: Artifact[] = [
  {
    id: "art-2", name: "Checkout flow", folderId: "checkout-flow", kind: "prototype",
    updated: "1d", frames: 6, tags: ["flow"],
    preview: "linear-gradient(135deg, #101c36 0%, #1c4ab7 48%, #2666ed 72%, #699be1 100%)",
  },
  {
    id: "art-9", name: "Cart drawer", folderId: "checkout-flow", kind: "design",
    updated: "2d", frames: 2, tags: ["drawer"],
    preview: "linear-gradient(125deg, #faf9f6, #e7e3dc)",
  },
  {
    id: "art-11", name: "Empty checkout", folderId: "checkout-flow", kind: "skeleton",
    updated: "3d", frames: 2, tags: ["empty state"],
    preview: "linear-gradient(130deg, #1b1b1b 5%, #282828 48%, #454545 100%)",
  },
  {
    id: "art-1", name: "Discovery · Variant B", folderId: "taro", kind: "design",
    updated: "4m", frames: 3, tags: ["hero", "nike"],
    preview: "radial-gradient(ellipse at 0% 0%, #ff5906 0%, #ff965e 30%, #f6dbac 65%, #f6ebd7 100%)",
  },
  {
    id: "art-4", name: "Hero skeleton", folderId: "taro", kind: "skeleton",
    updated: "1h", frames: 4, tags: ["layout"],
    preview: "linear-gradient(130deg, #1a1a1a 5%, #303030 55%, #535353 100%)",
  },
  {
    id: "art-13", name: "Discovery · Variant A", folderId: "taro", kind: "design",
    updated: "3h", frames: 3, tags: ["hero"],
    preview: "repeating-linear-gradient(135deg, #f7f4ed 0px, #f7f4ed 12px, #e7e1d6 12px, #e7e1d6 24px)",
  },
  {
    id: "art-3", name: "Brand color ramp", folderId: "design-tokens", kind: "design",
    updated: "1d", frames: 1, tags: ["tokens", "color"],
    preview: "linear-gradient(115deg, #15101e 0%, #695085 35%, #ac92cf 65%, #e9ddf6 100%)",
  },
  {
    id: "art-10", name: "Type scale specimen", folderId: "design-tokens", kind: "design",
    updated: "2w", frames: 1, tags: ["typography"],
    preview: "linear-gradient(135deg, #dad5c9, #f5f0e6)",
  },
  {
    id: "art-5", name: "Athlete stories", folderId: "nike-discovery", kind: "design",
    updated: "3d", frames: 2, tags: ["editorial"],
    preview: "linear-gradient(140deg, #15271d 0%, #57705a 45%, #d2c9a9 100%)",
  },
  {
    id: "art-6", name: "Journal index", folderId: "nike-discovery", kind: "skeleton",
    updated: "4d", frames: 2, tags: ["grid"],
    preview: "linear-gradient(135deg, #1d1d1f, #414145)",
  },
  {
    id: "art-7", name: "Portfolio case study", folderId: "portfolio", kind: "design",
    updated: "6d", frames: 5, tags: ["portfolio"],
    preview: "radial-gradient(ellipse at 80% 20%, #c7d7bc, #73927f 45%, #25433b 100%)",
  },
  {
    id: "art-8", name: "Onboarding", folderId: "lifemate", kind: "prototype",
    updated: "1w", frames: 3, tags: ["flow", "onboarding"],
    preview: "linear-gradient(135deg, #242443 0%, #6267a6 55%, #b5bce1 100%)",
  },
];
