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
  undonePaths: Path[];
  setUndonePaths: Dispatch<SetStateAction<Path[]>>;
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
  canvasFrame: CanvasFrame | null;
  canvasBackgroundColor: string;
  unit: Unit;
  ppi: number;
  pressureCurve: { x: number, y: number }[];
  forceProportions: boolean;
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
  undonePaths,
  setUndonePaths,
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
  canvasFrame,
  canvasBackgroundColor,
  unit,
  ppi,
  pressureCurve,
  forceProportions,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Path | null>(null);

  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isSpacebarDown, setIsSpacebarDown] = useState(false);
  const originalToolRef = useRef<Tool>(activeTool);


  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  
  const [ruler, setRuler] = useState<{start: Point, end: Point} | null>(null);

  const animationFrameId = useRef<number>();
  const [selectionOffset, setSelectionOffset] = useState(0);
  const layerCanvasPoolRef = useRef<HTMLCanvasElement[]>([]);

  // Cursor preview state
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

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
            if (!canvas || !context || !selection) return null;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            const tempContext = tempCanvas.getContext('2d');
            if (!tempContext) return null;
            
            tempContext.save();
            applyTransform(tempContext, false);
            paths.filter(p => p.layerId === activeLayerId).forEach(path => drawPath(tempContext, path));
            
            const activeLayer = findLayer(layers, activeLayerId);
            activeLayer?.pastedImage.forEach(img => {
                tempContext.drawImage(img.imageData, img.x, img.y);
            });
            tempContext.restore();

            return tempContext.getImageData(selection.x, selection.y, selection.width, selection.height);
        },
        clearSelection: () => {
            if (!selection) return;

            const rectPath: Path = {
                points: [
                    {x: selection.x, y: selection.y, pressure: 0},
                    {x: selection.x + selection.width, y: selection.y + selection.height, pressure: 0}
                ],
                tool: 'eraser',
                brushType: 'round',
                color: '#000000',
                strokeWidth: 1,
                layerId: activeLayerId,
                shape: 'rectangle',
                opacity: 100,
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

      const viewMatrix = new DOMMatrix();
      viewMatrix.translateSelf(transform.x, transform.y);
      viewMatrix.scaleSelf(transform.zoom * (transform.flip.horizontal ? -1 : 1), transform.zoom * (transform.flip.vertical ? -1 : 1));
      viewMatrix.rotateSelf(transform.rotation);
      
      const invertedMatrix = viewMatrix.inverse();
      const transformedPoint = new DOMPoint(screenX, screenY).matrixTransform(invertedMatrix);
      
      const pressure = e.pointerType === 'pen' ? e.pressure : 0.5;

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

        if (!isPixelRemoval) {
            context.strokeStyle = path.color;
        }
        context.lineWidth = path.strokeWidth;
        context.strokeRect(start.x, start.y, rectWidth, rectHeight);
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
    if (!selection) return;
    context.save();
    context.setLineDash([4, 4]);
    context.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    context.lineWidth = 1 / transform.zoom;
    context.lineDashOffset = -selectionOffset;
    context.strokeRect(selection.x, selection.y, selection.width, selection.height);

    context.setLineDash([4, 4]);
    context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    context.lineDashOffset = 4 - selectionOffset;
    context.strokeRect(selection.x, selection.y, selection.width, selection.height);
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
        
        context.setTransform(1, 0, 0, 1, 0, 0);

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

        const getMajorMark = () => {
            switch(unit) {
                case 'px': return 100;
                case 'in': return ppi;
                case 'cm': return ppi / 2.54;
                case 'mm': return ppi / 2.54;
            }
        }
        const majorMark = getMajorMark();
        const minorMark = {
            px: majorMark / 10,
            in: majorMark / 10,
            cm: majorMark / 10,
            mm: majorMark / 10,
        }[unit];
        const { x: panX, y: panY, zoom } = transform;

        const xStartValue = Math.floor(-panX / zoom / minorMark) * minorMark;
        const xEndValue = (-panX + width) / zoom;

        for(let val = xStartValue; val < xEndValue; val += minorMark) {
            const screenX = val * zoom + panX + rulerSize;
            if (screenX < rulerSize) continue;
            
            const isMajor = Math.abs(val % majorMark) < 1e-9 || Math.abs(val % majorMark - majorMark) < 1e-9;
            const isHalfMark = unit === 'in' && (Math.abs(val % (majorMark/2)) < 1e-9 || Math.abs(val % (majorMark/2) - (majorMark/2)) < 1e-9);

            const markHeight = isMajor ? 10 : isHalfMark ? 7 : 5;
            context.beginPath();
            context.moveTo(screenX, rulerSize);
            context.lineTo(screenX, rulerSize - markHeight);
            context.stroke();

            if (isMajor) {
                 const labelValue = unit === 'mm' ? val / conversionFactor * 10 : val / conversionFactor;
                context.fillText(Math.round(labelValue).toString(), screenX, rulerSize - 15);
            }
        }
        
        const yStartValue = Math.floor(-panY / zoom / minorMark) * minorMark;
        const yEndValue = (-panY + height) / zoom;
        
        for(let val = yStartValue; val < yEndValue; val += minorMark) {
            const screenY = val * zoom + panY + rulerSize;
            if (screenY < rulerSize) continue;

            const isMajor = Math.abs(val % majorMark) < 1e-9 || Math.abs(val % majorMark - majorMark) < 1e-9;
            const isHalfMark = unit === 'in' && (Math.abs(val % (majorMark/2)) < 1e-9 || Math.abs(val % (majorMark/2) - (majorMark/2)) < 1e-9);
            
            const markWidth = isMajor ? 10 : isHalfMark ? 7 : 5;
            context.beginPath();
            context.moveTo(rulerSize, screenY);
            context.lineTo(rulerSize - markWidth, screenY);
            context.stroke();
            if (isMajor) {
                context.save();
                context.translate(rulerSize - 15, screenY);
                context.rotate(-Math.PI / 2);
                const labelValue = unit === 'mm' ? val / conversionFactor * 10 : val / conversionFactor;
                context.fillText(Math.round(labelValue).toString(), 0, 0);
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
        
        const rulerSize = showRulers && includeRulerOffset ? 30 : 0;
        context.translate(rulerSize, rulerSize);

        context.translate(transform.x, transform.y);
        
        const centerX = (canvas.width - rulerSize) / (2 * transform.zoom);
        const centerY = (canvas.height - rulerSize) / (2 * transform.zoom);
        
        context.translate(centerX, centerY);
        context.scale(transform.flip.horizontal ? -1 : 1, transform.flip.vertical ? -1 : 1);
        context.translate(-centerX, -centerY);
        
        context.translate(centerX, centerY);
        context.rotate(transform.rotation * Math.PI / 180);
        context.translate(-centerX, -centerY);

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

      const layerPaths = paths.filter(p => p.layerId === layer.id);
      const isCurrentLayer = (currentPath && currentPath.layerId === layer.id);
      const hasEraser = layerPaths.some(p => p.tool === 'eraser') || (isCurrentLayer && currentPath?.tool === 'eraser');

      if (!hasEraser) {
          context.save();
          context.globalAlpha = effectiveProps.opacity / 100;
          
          layerPaths.forEach(path => drawPath(context, path));
          if (isCurrentLayer && currentPath) {
              drawPath(context, currentPath);
          }
          
          if (layer.pastedImage) {
            layer.pastedImage.forEach(img => {
                context.drawImage(img.imageData, img.x, img.y);
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

          layerPaths.forEach(path => drawPath(offCtx, path));
          if (isCurrentLayer && currentPath) {
              drawPath(offCtx, currentPath);
          }
          
          if (layer.pastedImage) {
            layer.pastedImage.forEach(img => offCtx.drawImage(img.imageData, img.x, img.y));
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
    
    context.save();

    if (selection) {
        context.beginPath();
        if (isSelectionInverted) {
            const WORLD_SIZE = 1e5;
            context.rect(-WORLD_SIZE, -WORLD_SIZE, WORLD_SIZE * 2, WORLD_SIZE * 2);
            context.moveTo(selection.x, selection.y);
            context.lineTo(selection.x, selection.y + selection.height);
            context.lineTo(selection.x + selection.width, selection.y + selection.height);
            context.lineTo(selection.x + selection.width, selection.y);
            context.closePath();
        } else {
            context.rect(selection.x, selection.y, selection.width, selection.height);
        }
      context.clip();
    }
    
    drawLayers(context, layers, layerCanvasPoolRef.current);

    context.restore();
    
    if (selection) {
      drawSelection(context);
    }
    if (ruler) {
      drawRulerTool(context);
    }

    context.restore();

    if (showRulers) {
      drawRulers(context, canvas.width, canvas.height);
    }
    
    if (context) {
        context.globalCompositeOperation = 'source-over';
    }
  }, [paths, currentPath, transform, selection, layers, showGrid, showRulers, drawRulers, ruler, isSelectionInverted, canvasFrame, canvasBackgroundColor, selectionOffset, applyTransform]);

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
    });
    setUndonePaths([]);
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
    if (activeTool === 'shape' && activeLayer?.type === 'group') {
        return;
    }
    setIsDrawing(true);
    const point = getTransformedPoint(e);
    setStartPoint(point);
     if (activeTool === 'select' && selection) {
      if (point.x < selection.x || point.x > selection.x + selection.width ||
          point.y < selection.y || point.y > selection.y + selection.height) {
        setSelection(null);
      } else {
         setIsDrawing(false);
        return;
      }
    } else if (activeTool === 'select' || activeTool === 'lasso') {
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
        });
    }
    setUndonePaths([]);
  }

  const continueShapeOrSelect = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !startPoint) return;
      const endPoint = getTransformedPoint(e);

      if (activeTool === 'select' || activeTool === 'lasso') {
          const newSelection = {
              x: Math.min(startPoint.x, endPoint.x),
              y: Math.min(startPoint.y, endPoint.y),
              width: Math.abs(startPoint.x - endPoint.x),
              height: Math.abs(startPoint.y - endPoint.y)
          };
          setSelection(newSelection);
      } else if (activeTool === 'shape' && currentPath) {
          setCurrentPath({
              ...currentPath,
              points: [startPoint, endPoint]
          });
      }
  }

  const finishShapeOrSelect = () => {
      if (activeTool === 'shape' && currentPath) {
          setPaths(prev => [...prev, currentPath]);
          setCurrentPath(null);
      }
      setIsDrawing(false);
      setStartPoint(null);
      if(activeTool === 'select' && selection?.width === 0 && selection?.height === 0) {
          setSelection(null);
      }
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


  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    
    if ((activeTool === 'pan' || e.button === 1 || isSpacebarDown) && !lockView) {
      startPanning(e);
    } else if (activeTool === 'brush' || activeTool === 'eraser') {
      startDrawing(e);
    } else if (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape') {
      startShapeOrSelect(e);
    } else if (activeTool === 'pipette') {
      usePipette(e);
    } else if (activeTool === 'ruler') {
      startRuler(e);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    
    if (isPanning) {
      continuePanning(e);
    } else if (isDrawing && (activeTool === 'brush' || activeTool === 'eraser')) {
      continueDrawing(e);
    } else if (isDrawing && (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape')) {
        continueShapeOrSelect(e);
    } else if (isDrawing && activeTool === 'ruler') {
        continueRuler(e);
    }
  };

  const handlePointerUp = () => {
    if (isPanning) finishPanning();
    if (isDrawing && (activeTool === 'brush' || activeTool === 'eraser')) finishDrawing();
    if (isDrawing && (activeTool === 'select' || activeTool === 'lasso' || activeTool === 'shape')) finishShapeOrSelect();
    if (isDrawing && activeTool === 'ruler') finishRuler();
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