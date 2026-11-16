import { validateArtifactDesign, type ArtifactDesign } from './artifact-design';

const dimension = (value: number, unit: 'px' | 'rem' = 'px') => ({ value, unit });
const token = ($type: string, $value: unknown) => ({ $type, $value });
const group = <T>(values: Record<string,T>, translate: (value: T) => unknown) => Object.fromEntries(Object.entries(values).map(([key,value])=>[key,translate(value)]));
const color = (hex: string) => token('color', { colorSpace:'srgb', components:[1,3,5].map(index=>Number.parseInt(hex.slice(index,index+2),16)/255), hex });

/** DTCG 2025.10 export. Responsive rules and workflow-specific data travel as extensions. */
export function artifactTokens(input: ArtifactDesign) {
  const design=validateArtifactDesign(input);
  return {
    $description:design.name,
    $extensions:{'app.taro.design':{version:1,direction:design.direction,guidance:design.guidance,media:design.media,grid:design.grid,components:design.components}},
    color:{neutral:group(Object.fromEntries(design.neutral.map((value,index)=>[index,value])),color),...group(design.themes,theme=>group(theme,color))},
    typography:group(design.typography,role=>({
      ...token('typography',{
        fontFamily:role.family.split(',').map(family=>family.trim().replace(/^['"]|['"]$/g,'')),
        fontSize:dimension(role.size),fontWeight:role.weight,lineHeight:role.lineHeight,letterSpacing:dimension(role.tracking*role.size),
      }),
      $extensions:{'app.taro.design':{trackingEm:role.tracking,responsive:role.responsive,fontAssetId:role.fontAssetId}},
    })),
    spacing:group(design.spacing,value=>token('dimension',dimension(value))),
    radius:group(design.radius,value=>token('dimension',dimension(value))),
    blur:group(design.blur,value=>token('dimension',dimension(value))),
    elevation:group(design.elevation,value=>token('shadow',{
      color:{colorSpace:'srgb',components:[0,0,0],alpha:value.opacity},offsetX:dimension(0),offsetY:dimension(value.y),blur:dimension(value.blur),spread:dimension(0),
    })),
    motion:{fast:token('duration',{value:design.motion.fast,unit:'ms'}),normal:token('duration',{value:design.motion.normal,unit:'ms'}),slow:token('duration',{value:design.motion.slow,unit:'ms'}),easing:token('cubicBezier',design.motion.easing)},
  };
}
