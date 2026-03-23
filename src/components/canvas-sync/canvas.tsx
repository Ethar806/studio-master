'use client';

import { useRef, useEffect, useState, useCallback, type Dispatch, type SetStateAction, forwardRef, useImperativeHandle } from 'react';
import type { Tool, Selection, CanvasFrame } from './main-editor';
import { cn } from '@/lib/utils';
import type { BrushType } from './brush-panel';
import type { Layer } from './main-editor';
import { Unit } from './unit-resolution-dialog';


interface Point {
  x: number;
  y: number;
  pressure: number;
}

export interface Path {
  points: Point[];
  tool: 'brush' | 'eraser' | 'shape' | 'fill';
  strokeWidth: number;
  color: string;
  brushType: BrushType;
  layerId: number;
  shape?: 'rectangle';
  opacity?: number;
  clipRect?: { x: number, y: number, width: number, height: number } | null;
  isSelectionInverted?: boolean;
}

interface CanvasTransform {
    x: number;
    y: number;
    zoom: number;
    rotation: number;
    flip: { horizontal: boolean, vertical: boolean };
}

export interface CanvasRef {
    getSelectionImageData: () => ImageData | null;
    getLayerRaster: (layerId: number) => { imageData: HTMLCanvasElement; x: number; y: number } | null;
    clearSelection: () => void;
    fillSelection: (color: string) => void;
    drawPastedImage: (image: HTMLCanvasElement, x: number, y: number) => void;
    getVisibleFrame: () => Selection | null;
}

interface CanvasProps {
  activeTool: Tool;
  setActiveTool: (tool: Tool) => void;
  paths: Path[];
  setPaths: Dispatch<SetStateAction<Path[]>>;
  brushSize: number;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushOpacity: number;
  brushType: BrushType;
  layers: Layer[];
  activeLayerId: number;
  showGrid: boolean;
  showRulers: boolean;
  lockView: boolean;
  selection: Selection | null;
  setSelection: Dispatch<SetStateAction<Selection | null>>;
  onUndo: () => void;
  onRedo: () => void;
  transform: CanvasTransform;
  setTransform: Dispatch<SetStateAction<CanvasTransform>>;
  onPaste: (imageData: HTMLCanvasElement) => void;
  onSelectCanvasFrame: () => void;
  isSelectionInverted: boolean;
  activeChannel: 'all' | 'red' | 'green' | 'blue' | 'alpha';
  canvasFrame: CanvasFrame | null;
  canvasBackgroundColor: string;
  unit: Unit;
  ppi: number;
  pressureCurve: { x: number, y: number }[];
  forceProportions: boolean;
  onCommitTransformRaster?: (composite: HTMLCanvasElement, x: number, y: number, capturedLayerIds: number[], sel: { x: number; y: number; width: number; height: number } | null) => void;
  fillTolerance: number;
  fillContiguous: boolean;
  onPaintBucketFill: (imageData: HTMLCanvasElement, x: number, y: number) => void;
  onCommitCrop: (cropRect: {x: number, y: number, width: number, height: number}) => void;
  isSimulatingPressure: boolean;
}

export interface TransformSession {
  isActive: boolean;
  action: 'idle' | 'scale' | 'rotate' | 'move';
  grabHandle: 'tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r' | 'rot' | 'center' | null;
  startMouse: Point;
  initialRect: { x: number, y: number, width: number, height: number };
  currentRect: { x: number, y: number, width: number, height: number };
  rotation: number;
  initialRotation: number;
}

export interface CropSession {
  isActive: boolean;
  action: 'idle' | 'create' | 'resize' | 'move';
  grabHandle: 'tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r' | 'center' | null;
  startMouse: Point;
  initialRect: { x: number, y: number, width: number, height: number };
  currentRect: { x: number, y: number, width: number, height: number };
}

const RULER_BACKGROUND = '#ADFF2F';
const RULER_TEXT_COLOR = '#000000';
const RULER_LINE_COLOR = 'hsl(240 4% 30%)';
const GRID_LINE_COLOR = 'hsl(240 4% 30%)';

const findLayer = (layers: Layer[], id: number): Layer | null => {
    for (const layer of layers) {
        if (layer.id === id) return layer;
        if (layer.type === 'group' && layer.layers) {
            const found = findLayer(layer.layers, id);
            if (found) return found;
        }
    }
    return null;
};

const getEffectiveLayerProps = (layers: Layer[], id: number): { visible: boolean; opacity: number } => {
  let finalProps = { visible: true, opacity: 100 };
  
  const findAndApply = (currentLayers: Layer[], targetId: number, parentProps: {visible: boolean, opacity: number}): boolean => {
    for (const layer of currentLayers) {
      const currentVisible = parentProps.visible && layer.visible;
      const currentOpacity = (parentProps.opacity / 100) * (layer.opacity / 100) * 100;
      
      if (layer.id === targetId) {
        finalProps = { visible: currentVisible, opacity: currentOpacity };
        return true;
      }
      if (layer.type === 'group' && layer.layers) {
        if (findAndApply(layer.layers, targetId, { visible: currentVisible, opacity: currentOpacity })) {
          return true;
        }
      }
    }
    return false;
  };

  findAndApply(layers, id, { visible: true, opacity: 100 });
  return finalProps;
};


export const Canvas = forwardRef<CanvasRef, CanvasProps>(({
  activeTool,
  setActiveTool,
  paths,
  setPaths,
  brushSize,
  brushColor,
  setBrushColor,
  brushOpacity,
  brushType,
  layers,
  activeLayerId,
  showGrid,
  showRulers,
  lockView,
  selection,
  setSelection,
  onUndo,
  onRedo,
  transform,
  setTransform,
  onPaste,
  onSelectCanvasFrame,
  isSelectionInverted,
  activeChannel,
  canvasFrame,
  canvasBackgroundColor,
  unit,
  ppi,
  pressureCurve,
  forceProportions,
  onCommitTransformRaster,
  fillTolerance,
  fillContiguous,
  onPaintBucketFill,
  onCommitCrop,
  isSimulatingPressure,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Path | null>(null);

  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isSpacebarDown, setIsSpacebarDown] = useState(false);
  const originalToolRef = useRef<Tool>(activeTool);

  const [moveSession, setMoveSession] = useState<{ startX: number; startY: number; dx: number; dy: number } | null>(null);
  const [movingSelection, setMovingSelection] = useState<{ startX: number; startY: number; initialSelX: number; initialSelY: number } | null>(null);

  // draftSelection: only visible while the user is actively dragging to create a new selection
  const [draftSelection, setDraftSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Rasterized snapshot used during transform operations
  const transformRasterRef = useRef<HTMLCanvasElement | null>(null);
  const transformRasterOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformCapturedLayerIdsRef = useRef<number[]>([]);

  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  
  const [ruler, setRuler] = useState<{start: Point, end: Point} | null>(null);

  const animationFrameId = useRef<number>();
  const [selectionOffset, setSelectionOffset] = useState(0);
  const layerCanvasPoolRef = useRef<HTMLCanvasElement[]>([]);

  // Cursor preview state
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const [transformSession, setTransformSession] = useState<TransformSession | null>(null);
  const [cropSession, setCropSession] = useState<CropSession | null>(null);

  const getTransformMatrix = useCallback((session: TransformSession) => {
      const { initialRect, currentRect, rotation } = session;
      const matrix = new DOMMatrix();
      if (initialRect.width === 0 || initialRect.height === 0) return matrix;

      const cx = currentRect.x + currentRect.width / 2;
      const cy = currentRect.y + currentRect.height / 2;
      matrix.translateSelf(cx, cy);
      matrix.rotateSelf(rotation * 180 / Math.PI);
      matrix.scaleSelf(currentRect.width / initialRect.width, currentRect.height / initialRect.height);
      const icx = initialRect.x + initialRect.width / 2;
      const icy = initialRect.y + initialRect.height / 2;
      matrix.translateSelf(-icx, -icy);
      return matrix;
  }, []);

  useEffect(() => {
     if (activeTool === 'transform' && !transformSession) {
         // --- Determine bounding region to capture ---
         let bounds: { x: number, y: number, width: number, height: number } | null = null;
         
         if (selection) { 
             bounds = { ...selection }; 
         } else {
            // Compute bounds across ALL visible layers
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const collectBounds = (layerList: Layer[]) => {
                for (const layer of layerList) {
                    if (!layer.visible) continue;
                    paths.filter(p => p.layerId === layer.id).forEach(p => {
                        p.points.forEach(pt => {
                            minX = Math.min(minX, pt.x - p.strokeWidth / 2);
                            minY = Math.min(minY, pt.y - p.strokeWidth / 2);
                            maxX = Math.max(maxX, pt.x + p.strokeWidth / 2);
                            maxY = Math.max(maxY, pt.y + p.strokeWidth / 2);
                        });
                    });
                    layer.pastedImage?.forEach(img => {
                        const w = img.width ?? img.imageData.width;
                        const h = img.height ?? img.imageData.height;
                        minX = Math.min(minX, img.x); minY = Math.min(minY, img.y);
                        maxX = Math.max(maxX, img.x + w); maxY = Math.max(maxY, img.y + h);
                    });
                    if (layer.type === 'group' && layer.layers) collectBounds(layer.layers);
                }
            };
            collectBounds(layers);
            if (minX !== Infinity) {
                const PAD = 4;
                bounds = { x: minX - PAD, y: minY - PAD, width: (maxX - minX) + PAD * 2, height: (maxY - minY) + PAD * 2 };
            }
         }
         
         if (bounds) {
             // --- Rasterize all visible layers into a temp canvas at world coords ---
             const bx = Math.floor(bounds.x);
             const by = Math.floor(bounds.y);
             const bw = Math.ceil(bounds.width);
             const bh = Math.ceil(bounds.height);

             const raster = document.createElement('canvas');
             raster.width = bw;
             raster.height = bh;
             const rCtx = raster.getContext('2d');
             if (rCtx) {
                 rCtx.save();
                 rCtx.translate(-bx, -by);
                 // Draw all visible layers
                 const renderLayersFlat = (layerList: Layer[]) => {
                     [...layerList].reverse().forEach(layer => {
                         if (!layer.visible) return;
                         const effectiveProps = getEffectiveLayerProps(layers, layer.id);
                         if (!effectiveProps.visible) return;
                         rCtx.save();
                         rCtx.globalAlpha = effectiveProps.opacity / 100;
                         paths.filter(p => p.layerId === layer.id).forEach(p => drawPath(rCtx, p));
                         layer.pastedImage?.forEach(img => {
                             const w = img.width ?? img.imageData.width;
                             const h = img.height ?? img.imageData.height;
                             const cx = img.x + w / 2;
                             const cy = img.y + h / 2;
                             rCtx.save();
                             rCtx.translate(cx, cy);
                             if (img.rotation) rCtx.rotate(img.rotation);
                             rCtx.drawImage(img.imageData, -w/2, -h/2, w, h);
                             rCtx.restore();
                         });
                         if (layer.type === 'group' && layer.layers) renderLayersFlat(layer.layers);
                         rCtx.restore();
                     });
                 };
                 renderLayersFlat(layers);
                 rCtx.restore();
             }
             transformRasterRef.current = raster;
             transformRasterOriginRef.current = { x: bx, y: by };
             // Collect all layer IDs that were captured
             const collectAllIds = (layerList: Layer[]): number[] => {
                 let ids: number[] = [];
                 for (const l of layerList) {
                     if (l.visible) {
                         ids.push(l.id);
                         if (l.type === 'group' && l.layers) ids = ids.concat(collectAllIds(l.layers));
                     }
                 }
                 return ids;
             };
             transformCapturedLayerIdsRef.current = collectAllIds(layers);

             setTransformSession({
                 isActive: true, action: 'idle', grabHandle: null,
                 startMouse: {x:0,y:0,pressure:0},
                 initialRect: { x: bx, y: by, width: bw, height: bh },
                 currentRect: { x: bx, y: by, width: bw, height: bh },
                 rotation: 0,
                 initialRotation: 0
             });
         }
     } else if (activeTool !== 'transform' && transformSession) {
         setTransformSession(null);
         transformRasterRef.current = null;
     }
  }, [activeTool, transformSession, selection, activeLayerId, paths, layers]);

    const getAdjustedPressure = useCallback((inputPressure: number) => {
        if (inputPressure <= 0) return 0;
        if (inputPressure >= 1) return 1;
        let p1 = pressureCurve[0], p2 = pressureCurve[pressureCurve.length - 1];
        for (let i = 0; i < pressureCurve.length - 1; i++) {
            if (inputPressure >= pressureCurve[i].x && inputPressure <= pressureCurve[i+1].x) {
                p1 = pressureCurve[i];
                p2 = pressureCurve[i+1];
                break;
            }
        }
        const t = (inputPressure - p1.x) / (p2.x - p1.x);
        return p1.y + t * (p2.y - p1.y);
    }, [pressureCurve]);

    useImperativeHandle(ref, () => ({
        getSelectionImageData: () => {
            const canvas = canvasRef.current;
            const context = contextRef.current;
            if (!canvas || !context) return null;

            const sel = selection || { x: 0, y: 0, width: canvas.width / transform.zoom, height: canvas.height / transform.zoom };

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = sel.width;
            tempCanvas.height = sel.height;
            const tempContext = tempCanvas.getContext('2d');
            if (!tempContext) return null;
            
            tempContext.save();
            tempContext.translate(-sel.x, -sel.y);
            paths.filter(p => p.layerId === activeLayerId).forEach(path => drawPath(tempContext, path));
            
            const activeLayer = findLayer(layers, activeLayerId);
            activeLayer?.pastedImage.forEach(img => {
                tempContext.drawImage(img.imageData, img.x, img.y);
            });
            tempContext.restore();

            return tempContext.getImageData(0, 0, sel.width, sel.height);
        },
        getLayerRaster: (layerId: number) => {
            const l = findLayer(layers, layerId);
            if (!l) return null;

            const allPaths: Path[] = [];
            const allImages: { imageData: HTMLCanvasElement; x: number; y: number; rotation?: number; width?: number; height?: number }[] = [];

            const collectRecursive = (layer: Layer) => {
                paths.filter(p => p.layerId === layer.id).forEach(p => allPaths.push(p));
                layer.pastedImage?.forEach(img => allImages.push(img));
                if (layer.type === 'group' && layer.layers) {
                    layer.layers.forEach(child => collectRecursive(child));
                }
            };

            collectRecursive(l);

            // Compute bounding box
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            allPaths.forEach(p => {
                p.points.forEach(pt => {
                    const radius = p.strokeWidth / 2;
                    minX = Math.min(minX, pt.x - radius);
                    minY = Math.min(minY, pt.y - radius);
                    maxX = Math.max(maxX, pt.x + radius);
                    maxY = Math.max(maxY, pt.y + radius);
                });
            });

            allImages.forEach(img => {
                const w = img.width ?? img.imageData.width;
                const h = img.height ?? img.imageData.height;
                minX = Math.min(minX, img.x);
                minY = Math.min(minY, img.y);
                maxX = Math.max(maxX, img.x + w);
                maxY = Math.max(maxY, img.y + h);
            });

            if (minX === Infinity) return null;

            const width = Math.ceil(maxX - minX);
            const height = Math.ceil(maxY - minY);
            if (width <= 0 || height <= 0) return null;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            if (!tempCtx) return null;

            tempCtx.save();
            tempCtx.translate(-minX, -minY);
            
            // Note: This draws in a specific order. To be perfectly accurate we'd nestedly draw layers.
            // But since we are flattening, drawing all paths then all images of the collected set is a decent approximation.
            // Better: Re-use drawLayers logic on a temporary context? 
            // Yes, let's use a simplified drawLayers logic here to preserve inter-layer ordering.
            
            const drawRecursive = (layer: Layer, ctx: CanvasRenderingContext2D) => {
                const effectiveProps = getEffectiveLayerProps(layers, layer.id);
                if (!effectiveProps.visible) return;

                ctx.save();
                ctx.globalAlpha = effectiveProps.opacity / 100;

                const layerPaths = paths.filter(p => p.layerId === layer.id);
                layerPaths.forEach(path => drawPath(ctx, path));
                
                layer.pastedImage?.forEach(img => {
                    const w = img.width ?? img.imageData.width;
                    const h = img.height ?? img.imageData.height;
                    const cx = img.x + w / 2;
                    const cy = img.y + h / 2;
                    ctx.save();
                    ctx.translate(cx, cy);
                    if (img.rotation) ctx.rotate(img.rotation);
                    ctx.drawImage(img.imageData, -w/2, -h/2, w, h);
                    ctx.restore();
                });
                
                if (layer.type === 'group' && layer.layers) {
                    // Draw children in reverse (bottom up)
                    [...layer.layers].reverse().forEach(child => drawRecursive(child, ctx));
                }
                ctx.restore();
            };
            
            drawRecursive(l, tempCtx);
            tempCtx.restore();

            return { imageData: tempCanvas, x: minX, y: minY };
        },
        clearSelection: () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const sel = selection || { x: -10000, y: -10000, width: 20000, height: 20000 };

            const rectPath: Path = {
                points: [
                    {x: sel.x, y: sel.y, pressure: 0},
                    {x: sel.x + sel.width, y: sel.y + sel.height, pressure: 0}
                ],
                tool: 'eraser',
                brushType: 'round',
                color: '#000000',
                strokeWidth: 1,
                layerId: activeLayerId,
                shape: 'rectangle',
                opacity: 100,
                clipRect: sel,
                isSelectionInverted: isSelectionInverted,
            };
            setPaths(prev => [...prev, rectPath]);
            setSelection(null);
        },
        fillSelection: (color: string) => {
            if (!selection) return;
            const fillPath: Path = {
                points: [
                    { x: selection.x, y: selection.y, pressure: 0 },
                    { x: selection.x + selection.width, y: selection.y + selection.height, pressure: 0 }
                ],
                tool: 'fill',
                brushType: 'round',
                color: color,
                strokeWidth: 1,
                layerId: activeLayerId,
                shape: 'rectangle',
                opacity: 100,
                clipRect: selection,
                isSelectionInverted: isSelectionInverted,
            };
            setPaths(prev => [...prev, fillPath]);
        },
        drawPastedImage: (image: HTMLCanvasElement, x: number, y: number) => {
            const canvas = canvasRef.current;
            const context = contextRef.current;
            if (!canvas || !context) return;
            context.drawImage(image, x, y);
        },
        getVisibleFrame: () => {
            const canvas = canvasRef.current;
            if (!canvas) return null;
            const rulerSize = showRulers ? 30 : 0;
            const canvasContentWidth = canvas.width - rulerSize;
            const canvasContentHeight = canvas.height - rulerSize;
            
            const viewX = -transform.x / transform.zoom;
            const viewY = -transform.y / transform.zoom;
            
            const viewWidth = canvasContentWidth / transform.zoom;
            const viewHeight = canvasContentHeight / transform.zoom;
            
            return {
                x: viewX,
                y: viewY,
                width: viewWidth,
                height: viewHeight,
            }
        },
    }));

  const getTransformedPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0, pressure: 0.5 };

      const rect = canvas.getBoundingClientRect();
      const rulerSize = showRulers ? 30 : 0;
      
      let screenX = e.clientX - rect.left - rulerSize;
      let screenY = e.clientY - rect.top - rulerSize;
      
      if (forceProportions) {
          const canvasWidth = rect.width - rulerSize;
          const canvasHeight = rect.height - rulerSize;
          const canvasRatio = canvasWidth / canvasHeight;
          const tabletRatio = 4 / 3;

          if (canvasRatio > tabletRatio) {
              const effectiveWidth = canvasHeight * tabletRatio;
              const xOffset = (canvasWidth - effectiveWidth) / 2;
              screenX = Math.max(0, screenX - xOffset) / effectiveWidth * canvasWidth;
          } else if (canvasRatio < tabletRatio) {
              const effectiveHeight = canvasWidth / tabletRatio;
              const yOffset = (canvasHeight - effectiveHeight) / 2;
              screenY = Math.max(0, screenY - yOffset) / effectiveHeight * canvasHeight;
          }
      }

      const dpr = window.devicePixelRatio || 1;
      const viewMatrix = new DOMMatrix();
      
      // Screen space translate by pan offset
      viewMatrix.translateSelf(transform.x, transform.y);
      
      // Pivot for flip/rotation is the center of the drawing area in screen pixels
      const centerX = (rect.width - rulerSize) / 2;
      const centerY = (rect.height - rulerSize) / 2;
      
      viewMatrix.translateSelf(centerX, centerY);
      viewMatrix.rotateSelf(transform.rotation);
      viewMatrix.scaleSelf(transform.flip.horizontal ? -1 : 1, transform.flip.vertical ? -1 : 1);
      viewMatrix.translateSelf(-centerX, -centerY);
      
      // Zoom
      viewMatrix.scaleSelf(transform.zoom, transform.zoom);
      
      const invertedMatrix = viewMatrix.inverse();
      const transformedPoint = new DOMPoint(screenX, screenY).matrixTransform(invertedMatrix);
      
      let pressure = e.pointerType === 'pen' ? e.pressure : 0.5;

      if (isSimulatingPressure && e.pointerType === 'mouse') {
          // Create a dynamic pressure value using a sine wave based on time
          // Oscillates between 0.2 and 1.0 to show clear variation
          const time = performance.now() / 200; 
          pressure = 0.6 + Math.sin(time) * 0.4;
      }

      return {
        x: transformedPoint.x,
        y: transformedPoint.y,
        pressure: getAdjustedPressure(pressure),
      };
    },
    [transform, showRulers, getAdjustedPressure, forceProportions]
  );
  
  const getScreenPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0, pressure: 0.5 };
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return { x, y, pressure: 0.5 };
  }


  const drawPath = (context: CanvasRenderingContext2D, path: Path) => {
    const effectiveProps = getEffectiveLayerProps(layers, path.layerId);
    if (!effectiveProps.visible || path.points.length < 1) return;

    context.save();

    if (path.clipRect) {
        context.beginPath();
        if (path.isSelectionInverted) {
            const WORLD_SIZE = 1e5;
            context.rect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);
            context.moveTo(path.clipRect.x, path.clipRect.y);
            context.lineTo(path.clipRect.x, path.clipRect.y + path.clipRect.height);
            context.lineTo(path.clipRect.x + path.clipRect.width, path.clipRect.y + path.clipRect.height);
            context.lineTo(path.clipRect.x + path.clipRect.width, path.clipRect.y);
            context.closePath();
        } else {
            context.rect(path.clipRect.x, path.clipRect.y, path.clipRect.width, path.clipRect.height);
        }
        context.clip();
    }

    const isPixelRemoval = path.tool === 'eraser';

    if (isPixelRemoval) {
        context.globalCompositeOperation = 'destination-out';
        context.strokeStyle = '#000000';
    } else {
        context.globalCompositeOperation = 'source-over';
        context.strokeStyle = path.color;
    }
    
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (isPixelRemoval) {
        context.globalAlpha = (path.opacity ?? 100) / 100;
    } else {
        context.globalAlpha = (effectiveProps.opacity ?? 100) / 100;
    }

    if (path.tool === 'fill' && path.shape === 'rectangle') {
        const start = path.points[0];
        const end = path.points[path.points.length - 1];
        const rectWidth = end.x - start.x;
        const rectHeight = end.y - start.y;
        context.fillStyle = isPixelRemoval ? '#000000' : path.color;
        context.fillRect(start.x, start.y, rectWidth, rectHeight);
        context.restore();
        return;
    }

    if (path.tool === 'shape' && path.shape === 'rectangle') {
        const start = path.points[0];
        const end = path.points[path.points.length - 1];
        const rectWidth = end.x - start.x;
        const rectHeight = end.y - start.y;

        if (isPixelRemoval) {
            context.fillStyle = '#000000';
            context.fillRect(start.x, start.y, rectWidth, rectHeight);
        } else {
            context.strokeStyle = path.color;
            context.lineWidth = path.strokeWidth;
            context.strokeRect(start.x, start.y, rectWidth, rectHeight);
        }
        context.restore();
        return;
    }
    
    if (!isPixelRemoval) {
        switch (path.brushType) {
            case 'ink':
                context.globalAlpha *= 0.9;
                break;
            case 'pencil':
                context.globalAlpha *= 0.7;
                break;
            case 'marker':
                context.globalAlpha *= 0.5;
                context.lineCap = 'square';
                break;
            case 'calligraphy':
                context.globalAlpha *= 0.9;
                context.lineCap = 'butt';
                context.lineJoin = 'miter';
                break;
        }
    }

    if (path.brushType === 'airbrush') {
        path.points.forEach(p => {
            context.beginPath();
            const pressure = p.pressure > 0 ? p.pressure : 0.5;
            const currentBrushSize = path.strokeWidth * pressure;
            
            if (isPixelRemoval) {
                context.fillStyle = '#000000';
            } else {
                 const baseColorHex = path.color.substring(0,7);
                 const gradient = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, currentBrushSize / 2);
                 gradient.addColorStop(0, `${baseColorHex}80`);
                 gradient.addColorStop(1, `${baseColorHex}00`);
                 context.fillStyle = gradient;
            }

            context.arc(p.x, p.y, currentBrushSize / 2, 0, 2 * Math.PI);
            context.fill();
        });
        context.restore();
        return;
    }

    if (path.points.length < 2) {
        const p = path.points[0];
        const pressure = p.pressure > 0 ? p.pressure : 0.5;
        const radius = (path.strokeWidth * pressure) / 2;
        context.beginPath();
        context.fillStyle = isPixelRemoval ? '#000000' : path.color;
        context.arc(p.x, p.y, radius, 0, 2 * Math.PI);
        context.fill();
    } else {
        let prevMidPoint = { x: path.points[0].x, y: path.points[0].y };
        
        for (let i = 1; i < path.points.length; i++) {
            const p1 = path.points[i-1];
            const p2 = path.points[i];
            const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
            
            context.beginPath();
            context.moveTo(prevMidPoint.x, prevMidPoint.y);
            context.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
            context.lineWidth = path.strokeWidth * (p1.pressure || 0.5);
            context.stroke();
            
            prevMidPoint = midPoint;
        }
        
        const lastPoint = path.points[path.points.length - 1];
        context.beginPath();
        context.moveTo(prevMidPoint.x, prevMidPoint.y);
        context.lineTo(lastPoint.x, lastPoint.y);
        context.lineWidth = path.strokeWidth * (lastPoint.pressure || 0.5);
        context.stroke();
    }
    context.globalCompositeOperation = 'source-over';
    context.restore();
  };

  const drawSelection = (context: CanvasRenderingContext2D) => {
    const activeSel = draftSelection || selection;
    if (!activeSel) return;
    context.save();
    
    let x = activeSel.x;
    let y = activeSel.y;
    let w = activeSel.width;
    let h = activeSel.height;

    if (!draftSelection && activeTool === 'transform' && transformSession) {
        x = transformSession.currentRect.x;
        y = transformSession.currentRect.y;
        w = transformSession.currentRect.width;
        h = transformSession.currentRect.height;
    } else if (!draftSelection && activeTool === 'move' && moveSession) {
        x += moveSession.dx;
        y += moveSession.dy;
    }

    const dash = 5 / transform.zoom;
    // Subtle fill for committed selection
    if (!draftSelection) {
        context.fillStyle = 'rgba(0, 120, 255, 0.07)';
        context.fillRect(x, y, w, h);
    }

    context.setLineDash([dash, dash]);
    context.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    context.lineWidth = 1.5 / transform.zoom;
    context.lineDashOffset = -selectionOffset;
    context.strokeRect(x, y, w, h);

    context.setLineDash([dash, dash]);
    context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    context.lineDashOffset = dash - selectionOffset;
    context.strokeRect(x, y, w, h);
    context.restore();
  }

  const drawTransformBox = (context: CanvasRenderingContext2D, session: TransformSession) => {
      context.save();
      const { currentRect: r, rotation, initialRect } = session;
      const cx = r.x + r.width/2;
      const cy = r.y + r.height/2;

      context.translate(cx, cy);
      context.rotate(rotation);
      context.translate(-cx, -cy);

      // Draw the rasterized preview of what's being transformed
      if (transformRasterRef.current) {
          const raster = transformRasterRef.current;
          const scaleX = initialRect.width !== 0 ? r.width / initialRect.width : 1;
          const scaleY = initialRect.height !== 0 ? r.height / initialRect.height : 1;
          context.save();
          context.translate(cx, cy);
          context.scale(scaleX, scaleY);
          context.drawImage(raster, -raster.width / 2, -raster.height / 2);
          context.restore();
      }

      context.strokeStyle = '#0066ff';
      context.lineWidth = 1.5 / transform.zoom;
      context.strokeRect(r.x, r.y, r.width, r.height);
      
      const hs = 8 / transform.zoom; // handle size
      const handles = [
          {x: r.x, y: r.y}, {x: r.x+r.width/2, y: r.y}, {x: r.x+r.width, y: r.y},
          {x: r.x, y: r.y+r.height/2}, {x: r.x+r.width, y: r.y+r.height/2},
          {x: r.x, y: r.y+r.height}, {x: r.x+r.width/2, y: r.y+r.height}, {x: r.x+r.width, y: r.y+r.height}
      ];
      context.fillStyle = '#ffffff';
      handles.forEach(p => {
          context.fillRect(p.x - hs/2, p.y - hs/2, hs, hs);
          context.strokeRect(p.x - hs/2, p.y - hs/2, hs, hs);
      });
      // rotation handle
      context.beginPath();
      context.moveTo(cx, r.y);
      context.lineTo(cx, r.y - 30/transform.zoom);
      context.stroke();
      context.beginPath();
      context.fillStyle = '#0066ff';
      context.arc(cx, r.y - 30/transform.zoom, hs/2, 0, Math.PI*2);
      context.fill();
      context.stroke();

      context.restore();
  }

  const drawCropOverlay = (context: CanvasRenderingContext2D, session: CropSession) => {
      context.save();
      const { currentRect: r } = session;
      
      context.fillStyle = 'rgba(0,0,0,0.6)';
      context.beginPath();
      context.rect((-transform.x - 5000) / transform.zoom, (-transform.y - 5000) / transform.zoom, 10000 / transform.zoom, 10000 / transform.zoom);
      context.rect(r.x, r.y, r.width, r.height);
      context.fill('evenodd');

      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5 / transform.zoom;
      context.setLineDash([4/transform.zoom, 4/transform.zoom]);
      context.strokeRect(r.x, r.y, r.width, r.height);
      context.setLineDash([]);
      
      if (session.isActive) {
          const hs = 8 / transform.zoom;
          const handles = [
              {x: r.x, y: r.y}, {x: r.x+r.width/2, y: r.y}, {x: r.x+r.width, y: r.y},
              {x: r.x, y: r.y+r.height/2}, {x: r.x+r.width, y: r.y+r.height/2},
              {x: r.x, y: r.y+r.height}, {x: r.x+r.width/2, y: r.y+r.height}, {x: r.x+r.width, y: r.y+r.height}
          ];
          context.fillStyle = '#ffffff';
          context.strokeStyle = '#000000';
          handles.forEach(p => {
              context.fillRect(p.x - hs/2, p.y - hs/2, hs, hs);
              context.strokeRect(p.x - hs/2, p.y - hs/2, hs, hs);
          });
      }
      context.restore();
  }

  const drawGrid = (context: CanvasRenderingContext2D, width: number, height: number) => {
    context.save();
    context.strokeStyle = GRID_LINE_COLOR;
    context.lineWidth = 0.5 / transform.zoom;
    const gridSize = 50;

    const viewX = -transform.x / transform.zoom;
    const viewY = -transform.y / transform.zoom;
    const viewWidth = width / transform.zoom;
    const viewHeight = height / transform.zoom;
    
    const startX = Math.floor(viewX / gridSize) * gridSize;
    const startY = Math.floor(viewY / gridSize) * gridSize;

    for (let x = startX; x < viewX + viewWidth; x += gridSize) {
        context.beginPath();
        context.moveTo(x, startY);
        context.lineTo(x, viewY + viewHeight);
        context.stroke();
    }
    for (let y = startY; y < viewY + viewHeight; y += gridSize) {
        context.beginPath();
        context.moveTo(startX, y);
        context.lineTo(viewX + viewWidth, y);
        context.stroke();
    }
    context.restore();
  }

    const drawRulers = useCallback((context: CanvasRenderingContext2D, width: number, height: number) => {
        const rulerSize = 30;
        context.save();
        
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        context.fillStyle = RULER_BACKGROUND;
        context.fillRect(0, 0, width, rulerSize);
        context.fillRect(0, 0, rulerSize, height);
        
        context.strokeStyle = RULER_LINE_COLOR;
        context.fillStyle = RULER_TEXT_COLOR;
        context.font = '10px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        const conversionFactor = {
            px: 1,
            in: ppi,
            mm: ppi / 25.4,
            cm: ppi / 2.54,
        }[unit];

        const { x: panX, y: panY, zoom } = transform;
        
        const targetGapScreen = 100;
        const targetGapWorld = targetGapScreen / zoom;
        const targetGapUnits = targetGapWorld / conversionFactor;

        let exponent = Math.floor(Math.log10(targetGapUnits));
        let fraction = targetGapUnits / Math.pow(10, exponent);
        
        let niceFraction;
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3.5) niceFraction = 2;
        else if (fraction < 7.5) niceFraction = 5;
        else { niceFraction = 1; exponent += 1; }
        
        let majorMarkUnits = niceFraction * Math.pow(10, exponent);
        let minorDivisions = 10;
        
        if (unit === 'in' && targetGapUnits <= 2) {
            const denom = Math.pow(2, Math.round(Math.log2(1 / targetGapUnits)));
            majorMarkUnits = 1 / denom;
            if (majorMarkUnits >= 1) majorMarkUnits = Math.round(majorMarkUnits);
            minorDivisions = 8;
        }
        
        const majorMark = majorMarkUnits * conversionFactor;
        
        let minorMark = majorMark / minorDivisions;
        let activeDivisions = minorDivisions;
        
        if (minorMark * zoom < 5) {
            activeDivisions = unit === 'in' ? 4 : 5;
            minorMark = majorMark / activeDivisions;
        }
        if (minorMark * zoom < 5) {
            activeDivisions = unit === 'in' ? 2 : 2;
            minorMark = majorMark / activeDivisions;
        }
        if (minorMark * zoom < 5) {
            activeDivisions = 1;
            minorMark = majorMark;
        }

        const formatLabel = (val: number) => {
            const v = val / conversionFactor;
            return (Math.round(v * 1000) / 1000).toString();
        };

        const xStartMarkIndex = Math.floor(-panX / zoom / minorMark);
        const xEndMarkIndex = Math.ceil((-panX + width) / zoom / minorMark);

        for (let i = xStartMarkIndex; i <= xEndMarkIndex; i++) {
            const val = i * minorMark;
            const screenX = val * zoom + panX + rulerSize;
            if (screenX < rulerSize) continue;
            
            const isMajor = i % activeDivisions === 0;
            const isHalfMark = activeDivisions % 2 === 0 && i % (activeDivisions / 2) === 0;

            const markHeight = isMajor ? 10 : isHalfMark ? 7 : 5;
            context.beginPath();
            context.moveTo(screenX, rulerSize);
            context.lineTo(screenX, rulerSize - markHeight);
            context.stroke();

            if (isMajor) {
                context.fillText(formatLabel(val), screenX, rulerSize - 15);
            }
        }
        
        const yStartMarkIndex = Math.floor(-panY / zoom / minorMark);
        const yEndMarkIndex = Math.ceil((-panY + height) / zoom / minorMark);

        for (let i = yStartMarkIndex; i <= yEndMarkIndex; i++) {
            const val = i * minorMark;
            const screenY = val * zoom + panY + rulerSize;
            if (screenY < rulerSize) continue;

            const isMajor = i % activeDivisions === 0;
            const isHalfMark = activeDivisions % 2 === 0 && i % (activeDivisions / 2) === 0;

            const markWidth = isMajor ? 10 : isHalfMark ? 7 : 5;
            context.beginPath();
            context.moveTo(rulerSize, screenY);
            context.lineTo(rulerSize - markWidth, screenY);
            context.stroke();

            if (isMajor) {
                context.save();
                context.translate(rulerSize - 15, screenY);
                context.rotate(-Math.PI / 2);
                context.fillText(formatLabel(val), 0, 0);
                context.restore();
            }
        }

        context.restore();
    }, [transform, unit, ppi]);

    const drawRulerTool = (context: CanvasRenderingContext2D) => {
        if (!ruler) return;
        context.save();
        context.beginPath();
        context.moveTo(ruler.start.x, ruler.start.y);
        context.lineTo(ruler.end.x, ruler.end.y);
        context.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        context.lineWidth = 2 / transform.zoom;
        context.setLineDash([6, 3]);
        context.stroke();
        context.setLineDash([]);
        
        context.fillStyle = 'rgba(255, 255, 255, 0.8)';
        context.beginPath();
        context.arc(ruler.start.x, ruler.start.y, 4 / transform.zoom, 0, 2* Math.PI);
        context.fill();
        context.stroke();
        
        context.beginPath();
        context.arc(ruler.end.x, ruler.end.y, 4 / transform.zoom, 0, 2* Math.PI);
        context.fill();
        context.stroke();


        const dx = ruler.end.x - ruler.start.x;
        const dy = ruler.end.y - ruler.start.y;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        const text = `${distance.toFixed(1)} px`;
        const midX = (ruler.start.x + ruler.end.x) / 2;
        const midY = (ruler.start.y + ruler.end.y) / 2;

        context.font = `${14 / transform.zoom}px sans-serif`;
        const textMetrics = context.measureText(text);
        const textWidth = textMetrics.width;
        const textHeight = 14 / transform.zoom;

        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(midX - textWidth/2 - 4/transform.zoom, midY - textHeight - 4/transform.zoom, textWidth + 8/transform.zoom, textHeight + 8/transform.zoom);
        
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, midX, midY - textHeight/2 + 2/transform.zoom);

        context.restore();
    }
    
    const drawCanvasFrame = (context: CanvasRenderingContext2D) => {
        if (!canvasFrame) return;
    }


  const applyTransform = useCallback((context: CanvasRenderingContext2D, includeRulerOffset = true) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const dpr = window.devicePixelRatio || 1;
        const rulerSize = showRulers && includeRulerOffset ? 30 : 0;
        
        // Use setTransform to avoid stacking from DRP or previous calls
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.translate(rulerSize, rulerSize);

        // Pan offset
        context.translate(transform.x, transform.y);
        
        // Pivot point (center of the visible drawing area in screen pixels)
        const centerX = (canvas.width / dpr - rulerSize) / 2;
        const centerY = (canvas.height / dpr - rulerSize) / 2;
        
        context.translate(centerX, centerY);
        context.rotate(transform.rotation * Math.PI / 180);
        context.scale(transform.flip.horizontal ? -1 : 1, transform.flip.vertical ? -1 : 1);
        context.translate(-centerX, -centerY);
        
        // Zoom
        context.scale(transform.zoom, transform.zoom);
  }, [transform, showRulers]);
    
  const drawLayers = (context: CanvasRenderingContext2D, layersToDraw: Layer[], layerCanvasPool: HTMLCanvasElement[] = [], depth: number = 0) => {
    const getLayerCanvas = () => {
        while (layerCanvasPool.length <= depth) {
            layerCanvasPool.push(document.createElement('canvas'));
        }
        const canvas = layerCanvasPool[depth];
        if (canvas.width !== context.canvas.width || canvas.height !== context.canvas.height) {
            canvas.width = context.canvas.width;
            canvas.height = context.canvas.height;
        }
        return canvas;
    };

    layersToDraw.slice().reverse().forEach(layer => {
      const effectiveProps = getEffectiveLayerProps(layers, layer.id);
      if (!effectiveProps.visible) return;

      // While a transform raster exists, hide all captured layers — the raster is drawn
      // by drawTransformBox and represents the current visual state.
      if (transformRasterRef.current && transformCapturedLayerIdsRef.current.includes(layer.id)) {
          return;
      }

      const layerPaths = paths.filter(p => p.layerId === layer.id);
      const isCurrentLayer = (currentPath && currentPath.layerId === layer.id);
      const hasEraser = layerPaths.some(p => p.tool === 'eraser') || (isCurrentLayer && currentPath?.tool === 'eraser');
      const isTransformLayer = (activeTool === 'transform' && transformSession && layer.id === activeLayerId);

      if (!hasEraser) {
          context.save();
          context.globalAlpha = effectiveProps.opacity / 100;
          
          if (isTransformLayer && transformSession) {
             const m = getTransformMatrix(transformSession);
             context.transform(m.a, m.b, m.c, m.d, m.e, m.f);
          } else if (activeTool === 'move' && moveSession && layer.id === activeLayerId) {
             context.translate(moveSession.dx, moveSession.dy);
          }

          layerPaths.forEach(path => drawPath(context, path));
          if (isCurrentLayer && currentPath) {
              drawPath(context, currentPath);
          }
          
          if (layer.pastedImage) {
            layer.pastedImage.forEach(img => {
                context.save();
                const w = img.width ?? img.imageData.width;
                const h = img.height ?? img.imageData.height;
                const cx = img.x + w / 2;
                const cy = img.y + h / 2;
                context.translate(cx, cy);
                if (img.rotation) context.rotate(img.rotation);
                context.drawImage(img.imageData, -w/2, -h/2, w, h);
                context.restore();
            });
          }

          if (layer.type === 'group' && layer.layers) {
              drawLayers(context, layer.layers, layerCanvasPool, depth + 1);
          }
          
          context.restore();
      } else {
          const offCanvas = getLayerCanvas();
          const offCtx = offCanvas.getContext('2d');
          if (!offCtx) return;

          offCtx.save();
          offCtx.setTransform(1, 0, 0, 1, 0, 0);
          offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
          offCtx.restore();

          offCtx.save();
          offCtx.setTransform(context.getTransform());

          if (isTransformLayer && transformSession) {
             const m = getTransformMatrix(transformSession);
             offCtx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
          } else if (activeTool === 'move' && moveSession && layer.id === activeLayerId) {
             offCtx.translate(moveSession.dx, moveSession.dy);
          }

          layerPaths.forEach(path => drawPath(offCtx, path));
          if (isCurrentLayer && currentPath) {
              drawPath(offCtx, currentPath);
          }
          
          if (layer.pastedImage) {
            layer.pastedImage.forEach(img => {
                offCtx.save();
                const w = img.width ?? img.imageData.width;
                const h = img.height ?? img.imageData.height;
                const cx = img.x + w / 2;
                const cy = img.y + h / 2;
                offCtx.translate(cx, cy);
                if (img.rotation) offCtx.rotate(img.rotation);
                offCtx.drawImage(img.imageData, -w/2, -h/2, w, h);
                offCtx.restore();
            });
          }

          if (layer.type === 'group' && layer.layers) {
              drawLayers(offCtx, layer.layers, layerCanvasPool, depth + 1);
          }

          offCtx.restore();

          context.save();
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.globalAlpha = effectiveProps.opacity / 100;
          context.drawImage(offCanvas, 0, 0);
          context.restore();
      }
    });
  }


  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    contextRef.current = context;

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    
    context.save();
    applyTransform(context);
    
    drawLayers(context, layers, layerCanvasPoolRef.current);

    if (selection) {
      drawSelection(context);
    }
    if (activeTool === 'transform' && transformSession) {
      drawTransformBox(context, transformSession);
    }
    if (ruler) {
      drawRulerTool(context);
    }
    if (activeTool === 'crop' && cropSession) {
      drawCropOverlay(context, cropSession);
    }
    const dpr = window.devicePixelRatio || 1;
    if (showGrid) {
      drawGrid(context, canvas.width / dpr, canvas.height / dpr);
    }
    if (showRulers) {
      drawRulers(context, canvas.width / dpr, canvas.height / dpr);
    }
    
    // --- Channel Post-processing ---
    if (activeChannel !== 'all') {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            const a = data[i+3];
            let val = 0;
            if (activeChannel === 'red') val = r;
            else if (activeChannel === 'green') val = g;
            else if (activeChannel === 'blue') val = b;
            else if (activeChannel === 'alpha') val = a;
            
            data[i] = val;
            data[i+1] = val;
            data[i+2] = val;
            data[i+3] = 255; // Render as opaque grayscale for intensity visualization
        }
        context.putImageData(imageData, 0, 0);
    }

    if (context) {
        context.globalCompositeOperation = 'source-over';
    }
  }, [paths, currentPath, transform, selection, layers, showGrid, showRulers, drawRulers, ruler, isSelectionInverted, canvasFrame, canvasBackgroundColor, selectionOffset, applyTransform, activeChannel]);

    useEffect(() => {
        const animate = () => {
            setSelectionOffset(offset => (offset + 1) % 8);
            animationFrameId.current = requestAnimationFrame(animate);
        };

        if (selection) {
            animationFrameId.current = requestAnimationFrame(animate);
        } else {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        }

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [selection]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if(container) {
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
          redrawCanvas();
      }
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    if(canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    
    return () => {
      if (canvas.parentElement) {
        resizeObserver.unobserve(canvas.parentElement);
      }
    };
  }, [redrawCanvas, showRulers]);


  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const activeLayer = findLayer(layers, activeLayerId);
    if (activeLayer?.type === 'group') {
        return;
    }
    setIsDrawing(true);
    const point = getTransformedPoint(e);
    const isPixelRemoval = activeTool === 'eraser';
    
    setCurrentPath({
      points: [point],
      tool: isPixelRemoval ? 'eraser' : 'brush',
      strokeWidth: brushSize,
      color: isPixelRemoval ? '#000000' : brushColor,
      brushType: isPixelRemoval ? 'round' : brushType,
      layerId: activeLayerId,
      opacity: isPixelRemoval ? brushOpacity : 100,
      clipRect: selection ? { ...selection } : null,
      isSelectionInverted: isSelectionInverted,
    });
  };

  const continueDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentPath) return;
    e.preventDefault();
    const point = getTransformedPoint(e);
    setCurrentPath((prev) => (prev ? { ...prev, points: [...prev.points, point] } : null));
  };

  const finishDrawing = () => {
    if (currentPath && currentPath.points.length > 0) {
      setPaths((prev) => [...prev, currentPath]);
    }
    setCurrentPath(null);
    setIsDrawing(false);
  };

  const startPanning = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (lockView) return;
    setIsPanning(true);
    setLastMousePosition({ x: e.clientX, y: e.clientY });
  };

  const continuePanning = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPanning || lockView) return;
    const dx = e.clientX - lastMousePosition.x;
    const dy = e.clientY - lastMousePosition.y;
    setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    setLastMousePosition({ x: e.clientX, y: e.clientY });
  };

  const finishPanning = () => {
    setIsPanning(false);
  };

  const startShapeOrSelect = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const activeLayer = findLayer(layers, activeLayerId);
    if (activeTool === 'shape' && activeLayer?.type === 'group') return;

    const point = getTransformedPoint(e);

    if (activeTool === 'select') {
      // If there is an existing selection and we click INSIDE it, start moving it
      if (selection &&
          point.x >= selection.x && point.x <= selection.x + selection.width &&
          point.y >= selection.y && point.y <= selection.y + selection.height) {
        setMovingSelection({ startX: point.x, startY: point.y, initialSelX: selection.x, initialSelY: selection.y });
        setIsDrawing(true);
        setStartPoint(point);
        return;
      }
      // Otherwise start a fresh drag — do NOT clear selection yet (we keep
      // the old one visible until the user actually drags a new region)
      setDraftSelection({ x: point.x, y: point.y, width: 0, height: 0 });
      setIsDrawing(true);
      setStartPoint(point);
      return;
    }

    // lasso / shape — existing behaviour
    setIsDrawing(true);
    setStartPoint(point);
    if (activeTool === 'lasso') {
      setSelection(null);
    }

    if (activeTool === 'shape') {
        setCurrentPath({
            points: [point, point],
            tool: 'shape',
            shape: 'rectangle',
            strokeWidth: brushSize,
            color: brushColor,
            brushType: 'round',
            layerId: activeLayerId,
            opacity: 100,
            clipRect: selection ? { ...selection } : null,
            isSelectionInverted: isSelectionInverted,
        });
    }
  }

  const continueShapeOrSelect = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const endPoint = getTransformedPoint(e);

      if (movingSelection && selection) {
          const dx = endPoint.x - movingSelection.startX;
          const dy = endPoint.y - movingSelection.startY;
          setSelection({ ...selection, x: movingSelection.initialSelX + dx, y: movingSelection.initialSelY + dy });
          return;
      }

      if (!isDrawing || !startPoint) return;

      if (activeTool === 'select') {
          const newSel = {
              x: Math.min(startPoint.x, endPoint.x),
              y: Math.min(startPoint.y, endPoint.y),
              width: Math.abs(startPoint.x - endPoint.x),
              height: Math.abs(startPoint.y - endPoint.y)
          };
          setDraftSelection(newSel);
      } else if (activeTool === 'lasso') {
          const newSel = {
              x: Math.min(startPoint.x, endPoint.x),
              y: Math.min(startPoint.y, endPoint.y),
              width: Math.abs(startPoint.x - endPoint.x),
              height: Math.abs(startPoint.y - endPoint.y)
          };
          setSelection(newSel);
      } else if (activeTool === 'shape' && currentPath) {
          setCurrentPath({
              ...currentPath,
              points: [startPoint, endPoint]
          });
      }
  }

  const finishShapeOrSelect = () => {
      if (movingSelection) {
          setMovingSelection(null);
          setIsDrawing(false);
          setStartPoint(null);
          return;
      }

      if (activeTool === 'select') {
          if (draftSelection && (draftSelection.width > 2 || draftSelection.height > 2)) {
              // Commit draft to real selection
              setSelection(draftSelection);
          } else {
              // Tiny drag = click outside = deselect
              setSelection(null);
          }
          setDraftSelection(null);
          setIsDrawing(false);
          setStartPoint(null);
          return;
      }
      
      if (activeTool === 'shape' && currentPath) {
          setPaths(prev => [...prev, currentPath]);
          setCurrentPath(null);
      }
      setIsDrawing(false);
      setStartPoint(null);
  }


  const usePipette = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempContext = tempCanvas.getContext('2d', { willReadFrequently: true });
    if(!tempContext) return;

    drawLayers(tempContext, layers, layerCanvasPoolRef.current);

    const point = getTransformedPoint(e);
    const pixel = tempContext.getImageData(point.x, point.y, 1, 1).data;
    
    const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
    const hexColor = `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;

    setBrushColor(hexColor);
    setActiveTool('brush');
  }

  const performFloodFill = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempContext = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempContext) return;
    drawLayers(tempContext, layers, layerCanvasPoolRef.current);

    const point = getTransformedPoint(e);
    const startX = Math.floor(point.x);
    const startY = Math.floor(point.y);

    if (startX < 0 || startY < 0 || startX >= tempCanvas.width || startY >= tempCanvas.height) return;

    const imageData = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = new Uint32Array(imageData.data.buffer);
    
    const targetIdx = startY * tempCanvas.width + startX;
    const targetColor = data[targetIdx];
    
    const rMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(brushColor);
    if (!rMatch) return;
    const fillR = parseInt(rMatch[1], 16);
    const fillG = parseInt(rMatch[2], 16);
    const fillB = parseInt(rMatch[3], 16);
    const fillA = Math.round((brushOpacity / 100) * 255);
    const fillColor32 = (fillA << 24) | (fillB << 16) | (fillG << 8) | fillR;

    const extractComponents = (c: number) => ({
       r: c & 0xFF,
       g: (c >> 8) & 0xFF,
       b: (c >> 16) & 0xFF,
       a: (c >> 24) & 0xFF
    });

    const targetC = extractComponents(targetColor);
    
    const colorMatch = (c: number) => {
        const testC = extractComponents(c);
        const dr = testC.r - targetC.r;
        const dg = testC.g - targetC.g;
        const db = testC.b - targetC.b;
        const da = testC.a - targetC.a;
        return (dr*dr + dg*dg + db*db + da*da) <= fillTolerance * fillTolerance;
    };

    if (colorMatch(fillColor32) && brushOpacity === 100) return;

    const w = tempCanvas.width;
    const h = tempCanvas.height;
    const mask = new Uint8Array(w * h);
    
    let minX = w, minY = h, maxX = 0, maxY = 0;

    if (!fillContiguous) {
        for (let i = 0; i < data.length; i++) {
            if (colorMatch(data[i])) {
               mask[i] = 1;
               const x = i % w;
               const y = Math.floor(i / w);
               if (x < minX) minX = x;
               if (x > maxX) maxX = x;
               if (y < minY) minY = y;
               if (y > maxY) maxY = y;
            }
        }
    } else {
        const stack = [startX, startY];
        while (stack.length > 0) {
            let y = stack.pop()!;
            let x = stack.pop()!;
            
            let i = y * w + x;
            while (y >= 0 && colorMatch(data[i]) && mask[i] === 0) {
                y--;
                i -= w;
            }
            y++;
            i += w;
            
            let spanLeft = false;
            let spanRight = false;
            
            while (y < h && colorMatch(data[i]) && mask[i] === 0) {
               mask[i] = 1;
               if (x < minX) minX = x;
               if (x > maxX) maxX = x;
               if (y < minY) minY = y;
               if (y > maxY) maxY = y;

               if (x > 0) {
                  if (colorMatch(data[i - 1]) && mask[i - 1] === 0) {
                      if (!spanLeft) {
                          stack.push(x - 1, y);
                          spanLeft = true;
                      }
                  } else {
                      spanLeft = false;
                  }
               }
               if (x < w - 1) {
                  if (colorMatch(data[i + 1]) && mask[i + 1] === 0) {
                      if (!spanRight) {
                          stack.push(x + 1, y);
                          spanRight = true;
                      }
                  } else {
                      spanRight = false;
                  }
               }
               y++;
               i += w;
            }
        }
    }

    if (maxX < minX || maxY < minY) return;

    const outW = maxX - minX + 1;
    const outH = maxY - minY + 1;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outW;
    outputCanvas.height = outH;
    const outCtx = outputCanvas.getContext('2d');
    if (!outCtx) return;

    const outImageData = outCtx.createImageData(outW, outH);
    const outData32 = new Uint32Array(outImageData.data.buffer);
    
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (mask[y * w + x] === 1) {
                outData32[(y - minY) * outW + (x - minX)] = fillColor32;
            }
        }
    }
    outCtx.putImageData(outImageData, 0, 0);

    onPaintBucketFill(outputCanvas, minX, minY);
  }

  const startRuler = (e: React.PointerEvent<HTMLCanvasElement>) => {
      setIsDrawing(true);
      const point = getTransformedPoint(e);
      setRuler({start: point, end: point});
  }

  const continueRuler = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !ruler) return;
      const point = getTransformedPoint(e);
      setRuler(prev => prev ? {...prev, end: point} : null);
  }

  const finishRuler = () => {
      setIsDrawing(false);
      setTimeout(() => {
        setRuler(null);
      }, 1500);
  }

  const startMoving = (e: React.PointerEvent<HTMLCanvasElement>) => {
      setIsDrawing(true);
      const point = getTransformedPoint(e);
      setMoveSession({ startX: point.x, startY: point.y, dx: 0, dy: 0 });
  }

  const continueMoving = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !moveSession) return;
      const point = getTransformedPoint(e);
      setMoveSession(prev => prev ? { ...prev, dx: point.x - prev.startX, dy: point.y - prev.startY } : null);
  }

  const finishTransform = () => {
      if (!isDrawing) return;
      if (transformSession && transformRasterRef.current) {
          const { currentRect: r, rotation, initialRect } = transformSession;

          // Build the final committed canvas: draw the raster with the
          // live transform applied, at world-space 1:1 scale.
          const outW = Math.ceil(Math.abs(r.width) + Math.abs(r.height) * Math.abs(Math.sin(rotation)) * 2);
          const outH = Math.ceil(Math.abs(r.height) + Math.abs(r.width) * Math.abs(Math.sin(rotation)) * 2);
          const safeDim = Math.max(outW, outH, 1);
          const out = document.createElement('canvas');
          out.width = safeDim;
          out.height = safeDim;
          const outCtx = out.getContext('2d')!;

          const cx = safeDim / 2;
          const cy = safeDim / 2;

          outCtx.save();
          outCtx.translate(cx, cy);
          outCtx.rotate(rotation);
          // Scale from initial to current size
          const scaleX = initialRect.width !== 0 ? r.width / initialRect.width : 1;
          const scaleY = initialRect.height !== 0 ? r.height / initialRect.height : 1;
          outCtx.scale(scaleX, scaleY);
          outCtx.drawImage(
              transformRasterRef.current,
              -transformRasterRef.current.width / 2,
              -transformRasterRef.current.height / 2
          );
          outCtx.restore();

          // Destination top-left in world coords
          const destX = Math.round(r.x + r.width / 2 - safeDim / 2);
          const destY = Math.round(r.y + r.height / 2 - safeDim / 2);

          onCommitTransformRaster?.(
              out,
              destX,
              destY,
              transformCapturedLayerIdsRef.current,
              selection
          );
          setSelection(null);
      }
      transformRasterRef.current = null;
      setTransformSession(null);
      setIsDrawing(false);
  }

  const finishMoving = () => {
      if (moveSession && (moveSession.dx !== 0 || moveSession.dy !== 0)) {
          if (selection) {
              setSelection({
                  ...selection,
                  x: selection.x + moveSession.dx,
                  y: selection.y + moveSession.dy
              });
          }
      }
      setMoveSession(null);
      setIsDrawing(false);
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    
    if (e.button !== 0 && e.button !== 1) return;
    
    if ((activeTool === 'pan' || e.button === 1 || isSpacebarDown) && !lockView) {
      startPanning(e);
    } else if (activeTool === 'move') {
      startMoving(e);
    } else if (activeTool === 'brush' || activeTool === 'eraser') {
      startDrawing(e);
    } else if (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape') {
      startShapeOrSelect(e);
    } else if (activeTool === 'fill') {
      performFloodFill(e);
    } else if (activeTool === 'pipette') {
      usePipette(e);
    } else if (activeTool === 'ruler') {
      startRuler(e);
    } else if (activeTool === 'crop') {
        const point = getTransformedPoint(e);
        if (cropSession) {
            const { currentRect: r } = cropSession;
            const hs = 15 / transform.zoom;
            const checkHit = (hx: number, hy: number) => Math.abs(point.x - hx) < hs && Math.abs(point.y - hy) < hs;
            let hit: any = null;
            if (checkHit(r.x, r.y)) hit = 'tl';
            else if (checkHit(r.x+r.width, r.y)) hit = 'tr';
            else if (checkHit(r.x, r.y+r.height)) hit = 'bl';
            else if (checkHit(r.x+r.width, r.y+r.height)) hit = 'br';
            else if (checkHit(r.x+r.width/2, r.y)) hit = 't';
            else if (checkHit(r.x+r.width/2, r.y+r.height)) hit = 'b';
            else if (checkHit(r.x, r.y+r.height/2)) hit = 'l';
            else if (checkHit(r.x+r.width, r.y+r.height/2)) hit = 'r';
            
            if (hit) {
                setCropSession(prev => prev ? {...prev, action: 'resize', grabHandle: hit, startMouse: point, initialRect: {...prev.currentRect}} : null);
                setIsDrawing(true);
                return;
            }
            if (point.x > r.x && point.x < r.x + r.width && point.y > r.y && point.y < r.y + r.height) {
                setCropSession(prev => prev ? {...prev, action: 'move', grabHandle: 'center', startMouse: point, initialRect: {...prev.currentRect}} : null);
                setIsDrawing(true);
                return;
            }
        }
        setCropSession({ isActive: true, action: 'create', grabHandle: null, startMouse: point, initialRect: {x: point.x, y: point.y, width: 0, height: 0}, currentRect: {x: point.x, y: point.y, width: 0, height: 0} });
        setIsDrawing(true);
    } else if (activeTool === 'transform' && transformSession) {
        const point = getTransformedPoint(e);
        const { currentRect: r } = transformSession;
        const cx = r.x + r.width/2;
        const cy = r.y + r.height/2;

        const rotDist = Math.hypot(point.x - cx, point.y - (r.y - 30/transform.zoom));
        if (rotDist < 15/transform.zoom) {
            setTransformSession(prev => prev ? {...prev, action: 'rotate', grabHandle: 'rot', startMouse: point, initialRotation: prev.rotation} : null);
            setIsDrawing(true);
            return;
        }

        const hs = 15 / transform.zoom;
        const checkHit = (hx: number, hy: number) => Math.abs(point.x - hx) < hs && Math.abs(point.y - hy) < hs;
        let hit: any = null;
        if (checkHit(r.x, r.y)) hit = 'tl';
        else if (checkHit(r.x+r.width, r.y)) hit = 'tr';
        else if (checkHit(r.x, r.y+r.height)) hit = 'bl';
        else if (checkHit(r.x+r.width, r.y+r.height)) hit = 'br';
        else if (checkHit(r.x+r.width/2, r.y)) hit = 't';
        else if (checkHit(r.x+r.width/2, r.y+r.height)) hit = 'b';
        else if (checkHit(r.x, r.y+r.height/2)) hit = 'l';
        else if (checkHit(r.x+r.width, r.y+r.height/2)) hit = 'r';
        
        if (hit) {
            setTransformSession(prev => prev ? {...prev, action: 'scale', grabHandle: hit, startMouse: point, initialRect: {...prev.currentRect}} : null);
            setIsDrawing(true);
            return;
        }

        if (point.x > r.x && point.x < r.x + r.width && point.y > r.y && point.y < r.y + r.height) {
            setTransformSession(prev => prev ? {...prev, action: 'move', grabHandle: 'center', startMouse: point, initialRect: {...prev.currentRect}} : null);
            setIsDrawing(true);
            return;
        }

        setTransformSession(prev => prev ? {...prev, action: 'rotate', grabHandle: 'rot', startMouse: point, initialRotation: prev.rotation} : null);
        setIsDrawing(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    
    if (isPanning) {
      continuePanning(e);
    } else if (isDrawing && activeTool === 'move') {
      continueMoving(e);
    } else if (isDrawing && (activeTool === 'brush' || activeTool === 'eraser')) {
      continueDrawing(e);
    } else if (isDrawing && (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape')) {
        continueShapeOrSelect(e);
    } else if (isDrawing && activeTool === 'ruler') {
        continueRuler(e);
    } else if (isDrawing && activeTool === 'transform' && transformSession) {
        const point = getTransformedPoint(e);
        const dx = point.x - transformSession.startMouse.x;
        const dy = point.y - transformSession.startMouse.y;
        
        setTransformSession(prev => {
            if (!prev) return prev;
            if (prev.action === 'move') {
                return { ...prev, currentRect: { ...prev.initialRect, x: prev.initialRect.x + dx, y: prev.initialRect.y + dy } };
            } else if (prev.action === 'scale') {
                let { x, y, width, height } = prev.initialRect;
                if (prev.grabHandle?.includes('l')) { x += dx; width -= dx; }
                if (prev.grabHandle?.includes('r')) { width += dx; }
                if (prev.grabHandle?.includes('t')) { y += dy; height -= dy; }
                if (prev.grabHandle?.includes('b')) { height += dy; }

                if (e.shiftKey) { 
                    const aspect = prev.initialRect.width / prev.initialRect.height;
                    // Proportional scaling mapped intuitively to grab point
                    if (Math.abs(width) > Math.abs(height * aspect)) { height = width / aspect; } 
                    else { width = height * aspect; }
                }
                return { ...prev, currentRect: { x, y, width, height } };
            } else if (prev.action === 'rotate') {
                const cx = prev.currentRect.x + prev.currentRect.width/2;
                const cy = prev.currentRect.y + prev.currentRect.height/2;
                const startAngle = Math.atan2(prev.startMouse.y - cy, prev.startMouse.x - cx);
                const curAngle = Math.atan2(point.y - cy, point.x - cx);
                let diff = curAngle - startAngle;
                let newRot = prev.initialRotation + diff;
                if (e.shiftKey) {
                    const snap = 15 * Math.PI / 180;
                    newRot = Math.round(newRot / snap) * snap;
                }
                return { ...prev, rotation: newRot };
            }
            return prev;
        });
    } else if (isDrawing && activeTool === 'crop' && cropSession) {
        const point = getTransformedPoint(e);
        const dx = point.x - cropSession.startMouse.x;
        const dy = point.y - cropSession.startMouse.y;
        
        setCropSession(prev => {
            if (!prev) return prev;
            if (prev.action === 'create') {
                const width = point.x - prev.startMouse.x;
                const height = point.y - prev.startMouse.y;
                return { ...prev, currentRect: { ...prev.initialRect, width, height } };
            } else if (prev.action === 'move') {
                return { ...prev, currentRect: { ...prev.initialRect, x: prev.initialRect.x + dx, y: prev.initialRect.y + dy } };
            } else if (prev.action === 'resize') {
                let { x, y, width, height } = prev.initialRect;
                if (prev.grabHandle?.includes('l')) { x += dx; width -= dx; }
                if (prev.grabHandle?.includes('r')) { width += dx; }
                if (prev.grabHandle?.includes('t')) { y += dy; height -= dy; }
                if (prev.grabHandle?.includes('b')) { height += dy; }

                if (e.shiftKey) { 
                    const aspect = prev.initialRect.width / prev.initialRect.height;
                    if (Math.abs(width) > Math.abs(height * aspect)) { height = width / aspect; } 
                    else { width = height * aspect; }
                }
                return { ...prev, currentRect: { x, y, width, height } };
            }
            return prev;
        });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (isPanning) finishPanning();
    if (isDrawing && activeTool === 'move') finishMoving();
    if (isDrawing && (activeTool === 'brush' || activeTool === 'eraser')) finishDrawing();
    if (isDrawing && (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape')) finishShapeOrSelect();
    if (isDrawing && activeTool === 'ruler') finishRuler();
    if (isDrawing && activeTool === 'transform') {
       setTransformSession(prev => prev ? {...prev, action: 'idle', grabHandle: null, initialRect: {...prev.currentRect}, initialRotation: prev.rotation} : null);
       setIsDrawing(false);
    }
    if (isDrawing && activeTool === 'crop') {
        // Normalize rect (handle negative width/height from 'create')
        setCropSession(prev => {
            if (!prev) return prev;
            let { x, y, width, height } = prev.currentRect;
            if (width < 0) { x += width; width = Math.abs(width); }
            if (height < 0) { y += height; height = Math.abs(height); }
            return {...prev, action: 'idle', grabHandle: null, initialRect: {x, y, width, height}, currentRect: {x, y, width, height}};
        });
        setIsDrawing(false);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (lockView) return;
    e.preventDefault();
    const rulerSize = showRulers ? 30 : 0;
    
    if (e.ctrlKey) {
        const zoomFactor = 1.1;
        const newZoom = e.deltaY < 0 ? transform.zoom * zoomFactor : transform.zoom / zoomFactor;
        const mouseX = e.nativeEvent.offsetX - rulerSize;
        const mouseY = e.nativeEvent.offsetY - rulerSize;
        const worldX = (mouseX - transform.x) / transform.zoom;
        const worldY = (mouseY - transform.y) / transform.zoom;
        const newX = mouseX - worldX * newZoom;
        const newY = mouseY - worldY * newZoom;
        setTransform(prev => ({ ...prev, x: newX, y: newY, zoom: newZoom }));
    } else {
        const dx = e.deltaX * -1;
        const dy = e.deltaY * -1;
        setTransform(prev => ({...prev, x: prev.x + dx, y: prev.y + dy}));
    }
  };
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName.toLowerCase() === 'input' || (e.target as HTMLElement).tagName.toLowerCase() === 'textarea') {
        return;
      }
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
      const isRedo = ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y');

      if (isUndo) {
        e.preventDefault();
        onUndo();
      } else if (isRedo) {
        e.preventDefault();
        onRedo();
      }

      if (e.code === 'Space' && !isSpacebarDown && !isDrawing && !lockView) {
        e.preventDefault();
        setIsSpacebarDown(true);
        originalToolRef.current = activeTool;
        setActiveTool('pan');
      }

      // Crop confirm / cancel
      if (activeTool === 'crop' && cropSession && cropSession.isActive) {
          if (e.code === 'Enter') {
              onCommitCrop(cropSession.currentRect);
              setCropSession(null);
          } else if (e.code === 'Escape') {
              setCropSession(null);
          }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
            e.preventDefault();
            setIsSpacebarDown(false);
            if (!isPanning) {
              setActiveTool(originalToolRef.current);
            }
        }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onUndo, onRedo, activeTool, setActiveTool, isPanning, isDrawing, isSpacebarDown, lockView]);


  useEffect(() => {
    if (!isPanning && isSpacebarDown === false && activeTool === 'pan') {
      setActiveTool(originalToolRef.current);
    }
  }, [isPanning, isSpacebarDown, activeTool, setActiveTool]);

  return (
    <div className={cn("w-full h-full relative overflow-hidden", showRulers && "pl-[30px] pt-[30px]")}>
        <canvas
        ref={canvasRef}
        style={{ backgroundColor: canvasBackgroundColor }}
        className={cn(
            'w-full h-full rounded-lg shadow-inner touch-none',
            { 'cursor-grab': (activeTool === 'pan' || isSpacebarDown) && !lockView },
            { 'active:cursor-grabbing': (activeTool === 'pan' || isSpacebarDown) && isPanning && !lockView },
            { 'cursor-crosshair': ['brush', 'eraser', 'select', 'lasso', 'shape', 'ruler'].includes(activeTool) },
            { 'cursor-eyedropper': activeTool === 'pipette' },
            { 'cursor-default': lockView }
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={() => setIsHovering(true)}
        onPointerLeave={() => {
            setIsHovering(false);
            if (isDrawing && (activeTool === 'brush' || activeTool === 'eraser')) finishDrawing();
            if (isPanning) finishPanning();
            if (isDrawing && (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape')) finishShapeOrSelect();
            if (isDrawing && activeTool === 'ruler') finishRuler();
        }}
        onWheel={handleWheel}
        aria-label="Main drawing canvas"
        />
        {isHovering && activeTool === 'eraser' && (
            <div
                className="absolute pointer-events-none rounded-full border border-white mix-blend-difference"
                style={{
                    width: brushSize * transform.zoom,
                    height: brushSize * transform.zoom,
                    left: mousePos.x + (showRulers ? 30 : 0),
                    top: mousePos.y + (showRulers ? 30 : 0),
                    transform: 'translate(-50%, -50%)',
                    boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
                }}
            />
        )}
    </div>
  );
});

Canvas.displayName = 'Canvas';