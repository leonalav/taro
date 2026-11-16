import references from "./skill-files/taro-reference-analysis/SKILL.md?raw";
import direction from "./skill-files/taro-art-direction/SKILL.md?raw";
import typography from "./skill-files/taro-typography/SKILL.md?raw";
import assets from "./skill-files/taro-asset-selection/SKILL.md?raw";
import motion from "./skill-files/taro-motion/SKILL.md?raw";
import three from "./skill-files/taro-3d-construction/SKILL.md?raw";

export const designSkills = [
  { id: "taro-reference-analysis", title: "Reference analysis", markdown: references },
  { id: "taro-art-direction", title: "Art direction", markdown: direction },
  { id: "taro-typography", title: "Typography", markdown: typography },
  { id: "taro-asset-selection", title: "Asset selection", markdown: assets },
  { id: "taro-motion", title: "Motion choreography", markdown: motion },
  { id: "taro-3d-construction", title: "3D construction", markdown: three },
] as const;
