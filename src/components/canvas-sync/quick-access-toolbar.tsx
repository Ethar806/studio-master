
'use client';
import * as React from 'react';

import {
    Brush,
    Hand,
    PaintBucket,
    Pipette,
    Ruler,
    Move,
    Lasso,
    Square as ShapeSquare,
    Sparkles,
    Upload,
    Minus,
    Plus,
    Undo2,
    Redo2,
    Eye,
    EyeOff,
    Layers,
    ZoomIn,
    ZoomOut,
    Waves,
    Settings2,
    RectangleHorizontal,
    CheckSquare,
    View,
    Trash2,
    Copy,
    Combine,
    LassoSelect,
    Grid,
    FolderPlus,
    ChevronDown,
    ChevronRight,
    Folder,
    Lock,
    LockKeyhole,
    Pen,
    Check,
    ArrowRightLeft,
    Eraser,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Tool, Layer } from './main-editor';
import { Separator } from '../ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Slider } from '../ui/slider';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { BrushPanel, type BrushType } from './brush-panel';
import { RgbaColor, RgbaStringColorPicker } from 'react-colorful';
import { ScrollArea } from '../ui/scroll-area';
import { useToast } from '@/hooks/use-toast';


function rgbaStringToObj(rgbaStr: string): RgbaColor {
    const [r, g, b, a] = rgbaStr.replace(/rgba?\(|\)|\s/g, '').split(',').map(Number);
    return { r, g, b, a: a === undefined ? 1 : a };
}

function rgbaToHex(rgba: RgbaColor) {
  const toHex = (c: number) => `0${c.toString(16)}`.slice(-2);
  return `#${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`;
}

interface QuickAccessToolbarProps {
    activeTool: Tool;
    setActiveTool: (tool: Tool) => void;
    brushSize: number;
    setBrushSize: (size: number) => void;
    brushColor: string;
    setBrushColor: (color: string) => void;
    secondaryBrushColor: string;
    setSecondaryBrushColor: (color: string) => void;
    brushOpacity: number;
    setBrushOpacity: (opacity: number) => void;
    brushType: BrushType;
    setBrushType: (type: BrushType) => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    swapColors: () => void;
    layers: Layer[];
    activeLayerId: number;
    setActiveLayerId: (id: number) => void;
    addLayer: () => void;
    addLayerGroup: () => void;
    deleteLayer: (id: number) => void;
    duplicateLayer: (id: number) => void;
    mergeLayerDown: (id: number) => void;
    toggleLayerProperty: (id: number, property: keyof Layer) => void;
    setLayerOpacity: (id: number, opacity: number) => void;
    renameLayer: (id: number, newName: string) => void;
    clearLayer: (id: number) => void;
    showGrid: boolean;
    setShowGrid: (show: boolean) => void;
    showRulers: boolean;
    setShowRulers: (show: boolean) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    transform: { zoom: number };
    leftHanded: boolean;
}

const tools: { name: Tool; icon: React.ElementType; label: string; shortcut: string }[] = [
    { name: 'brush', icon: Brush, label: 'Brush', shortcut: 'B' },
    { name: 'eraser', icon: Eraser, label: 'Eraser Tool', shortcut: 'Shift+E' },
    { name: 'pan', icon: Hand, label: 'Pan', shortcut: 'H' },
    { name: 'pipette', icon: Pipette, label: 'Pipette', shortcut: 'I' },
    { name: 'ruler', icon: Ruler, label: 'Ruler', shortcut: 'R' },
    { name: 'shape', icon: ShapeSquare, label: 'Shape', shortcut: 'U' },
    { name: 'select', icon: RectangleHorizontal, label: 'Select', shortcut: 'M' },
    { name: 'lasso', icon: LassoSelect, label: 'Lasso', shortcut: 'L' },
    { name: 'move', icon: Move, label: 'Move', shortcut: 'V' },
    { name: 'ai-object-remove', icon: Sparkles, label: 'AI Remove', shortcut: '' },
    { name: 'gradient', icon: PaintBucket, label: 'Gradient', shortcut: 'G' },
    { name: 'upload', icon: Upload, label: 'Upload', shortcut: '' },
];

export function QuickAccessToolbar({
    activeTool,
    setActiveTool,
    brushSize,
    setBrushSize,
    brushColor,
    setBrushColor,
    secondaryBrushColor,
    setSecondaryBrushColor,
    brushOpacity,
    setBrushOpacity,
    brushType,
    setBrushType,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    swapColors,
    layers,
    activeLayerId,
    setActiveLayerId,
    addLayer,
    addLayerGroup,
    deleteLayer,
    duplicateLayer,
    mergeLayerDown,
    toggleLayerProperty,
    setLayerOpacity,
    renameLayer,
    clearLayer,
    showGrid,
    setShowGrid,
    showRulers,
    setShowRulers,
    onZoomIn,
    onZoomOut,
    transform,
    leftHanded,
}: QuickAccessToolbarProps) {

    const handlePrimaryColorChange = (colorStr: string) => {
        const rgba = rgbaStringToObj(colorStr);
        setBrushColor(rgbaToHex(rgba));
        setBrushOpacity(rgba.a * 100);
    }
    
    const handleSecondaryColorChange = (colorStr: string) => {
        const rgba = rgbaStringToObj(colorStr);
        setSecondaryBrushColor(rgbaToHex(rgba));
    }

    const ActiveToolIcon = tools.find(t => t.name === activeTool)?.icon ?? Brush;
    
    return (
        <div className={cn(
            "flex h-16 items-center justify-between border-b bg-card px-4 shrink-0",
            leftHanded && "flex-row-reverse"
        )}>
            <div className='flex items-center gap-2'>
                <Popover>
                    <PopoverTrigger asChild>
                         <Button
                            variant="ghost"
                            size="icon"
                            className='flex-col h-auto py-1 px-2'
                            >
                            <ActiveToolIcon className="h-5 w-5" />
                            <span className="text-xs">Tool</span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="start" className="w-auto p-1 bg-card/80 backdrop-blur-sm border-0">
                        <ToolSelectionPanel activeTool={activeTool} setActiveTool={setActiveTool}/>
                    </PopoverContent>
                </Popover>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                'flex-col h-auto py-1 px-2',
                                activeTool === 'brush' && 'bg-primary/20 text-primary'
                            )}
                            onClick={() => setActiveTool('brush')}
                            >
                            <Brush className="h-5 w-5" />
                            <span className="text-xs">Brush</span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="start">
                        <BrushPanel activeBrush={brushType} onSelectBrush={setBrushType} />
                    </PopoverContent>
                </Popover>

                <Separator orientation="vertical" className="h-8 mx-2" />
                
                <ColorWells
                    primaryColor={brushColor}
                    secondaryColor={secondaryBrushColor}
                    onPrimaryChange={handlePrimaryColorChange}
                    onSecondaryChange={handleSecondaryColorChange}
                    onSwap={swapColors}
                    opacity={brushOpacity}
                />

                 <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setBrushSize(Math.max(1, brushSize-1))}> <Minus/> </Button>
                    <div className='flex flex-col items-center'>
                        <Label htmlFor="brush-size-slider" className="text-xs">Size: {brushSize} px</Label>
                        <Slider id="brush-size-slider" value={[brushSize]} onValueChange={(v) => setBrushSize(v[0])} max={100} step={1} className="w-24"/>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setBrushSize(Math.min(100, brushSize+1))}> <Plus/> </Button>
                </div>
                 <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setBrushOpacity(Math.max(0, brushOpacity-1))}> <Minus/> </Button>
                    <div className='flex flex-col items-center'>
                        <Label htmlFor="opacity-slider" className="text-xs">Opacity: {Math.round(brushOpacity)}%</Label>
                        <Slider id="opacity-slider" value={[brushOpacity]} onValueChange={(v) => setBrushOpacity(v[0])} max={100} step={1} className="w-24"/>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setBrushOpacity(Math.min(100, brushOpacity+1))}> <Plus/> </Button>
                </div>
            </div>

            <div className='flex items-center gap-2'>
                <Button variant="ghost" size="icon" onClick={onZoomOut}> <ZoomOut/> </Button>
                <span className='text-sm text-muted-foreground'>{Math.round(transform.zoom * 100)}%</span>
                <Button variant="ghost" size="icon" onClick={onZoomIn}> <ZoomIn/> </Button>
                <Separator orientation="vertical" className="h-8 mx-2" />
                <Button variant="ghost" onClick={onUndo} disabled={!canUndo}><Undo2 className="mr-2"/> Undo</Button>
                <Button variant="ghost" onClick={onRedo} disabled={!canRedo}><Redo2 className="mr-2"/> Redo</Button>

                <Separator orientation="vertical" className="h-8 mx-2" />

                <Popover>
                    <PopoverTrigger asChild>
                         <Button variant="ghost"><View className="mr-2"/> View</Button>
                    </PopoverTrigger>
                    <PopoverContent>
                       <ViewPopoverContent 
                         showGrid={showGrid} setShowGrid={setShowGrid}
                         showRulers={showRulers} setShowRulers={setShowRulers}
                       />
                    </PopoverContent>
                </Popover>


                <Popover>
                    <PopoverTrigger asChild>
                         <Button variant="ghost"><Layers className="mr-2"/> Layers</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                        <LayersPopoverContent 
                            layers={layers}
                            activeLayerId={activeLayerId}
                            setActiveLayerId={setActiveLayerId}
                            addLayer={addLayer}
                            addLayerGroup={addLayerGroup}
                            deleteLayer={deleteLayer}
                            duplicateLayer={duplicateLayer}
                            mergeLayerDown={mergeLayerDown}
                            toggleLayerProperty={toggleLayerProperty}
                            setLayerOpacity={setLayerOpacity}
                            renameLayer={renameLayer}
                            clearLayer={clearLayer}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}

function ToolSelectionPanel({ activeTool, setActiveTool }: { activeTool: Tool; setActiveTool: (tool: Tool) => void }) {
    return (
        <div className="grid grid-cols-4 bg-card/50 rounded-md p-1 gap-1">
            {tools.map((tool) => (
                <TooltipProvider key={tool.name}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={cn('w-10 h-10',
                                    activeTool === tool.name && 'bg-primary/20 text-primary'
                                )}
                                onClick={() => setActiveTool(tool.name)}
                            >
                                <tool.icon className="h-5 w-5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            <p>{tool.label} ({tool.shortcut})</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ))}
        </div>
    );
}

function ColorWells({ primaryColor, secondaryColor, onPrimaryChange, onSecondaryChange, onSwap, opacity }: {
    primaryColor: string,
    secondaryColor: string,
    onPrimaryChange: (color: string) => void,
    onSecondaryChange: (color: string) => void,
    onSwap: () => void,
    opacity: number,
}) {

    const primaryRgbaCss = React.useMemo(() => {
        if (!primaryColor.startsWith('#')) return `rgba(0,0,0, ${opacity / 100})`;
        const r = parseInt(primaryColor.slice(1, 3), 16);
        const g = parseInt(primaryColor.slice(3, 5), 16);
        const b = parseInt(primaryColor.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
    }, [primaryColor, opacity]);
    
    const secondaryRgbaCss = React.useMemo(() => {
        if (!secondaryColor.startsWith('#')) return `rgba(255,255,255, 1)`;
        const r = parseInt(secondaryColor.slice(1, 3), 16);
        const g = parseInt(secondaryColor.slice(3, 5), 16);
        const b = parseInt(secondaryColor.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, 1)`;
    }, [secondaryColor]);

    return (
        <div className="flex items-center gap-1">
            <div className="relative w-12 h-10">
                <Popover>
                    <PopoverTrigger asChild>
                         <Button variant="outline" className="absolute top-0 left-0 h-8 w-8 p-0 z-10 border-2 border-primary/50 shadow-md">
                            <div className="w-full h-full rounded-sm" style={{backgroundColor: primaryRgbaCss}}></div>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto border-0 p-0">
                         <div className="saturation-picker">
                            <RgbaStringColorPicker color={primaryRgbaCss} onChange={onPrimaryChange} />
                         </div>
                    </PopoverContent>
                </Popover>

                 <Popover>
                    <PopoverTrigger asChild>
                         <Button variant="outline" className="absolute bottom-0 right-0 h-6 w-6 p-0 z-0 border-2 border-primary/50 shadow-sm">
                            <div className="w-full h-full rounded-sm" style={{backgroundColor: secondaryRgbaCss}}></div>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto border-0 p-0">
                         <div className="saturation-picker">
                            <RgbaStringColorPicker color={secondaryRgbaCss} onChange={onSecondaryChange} />
                         </div>
                    </PopoverContent>
                </Popover>
            </div>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={onSwap}>
                            <ArrowRightLeft className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>Swap colors</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    )
}


function ToolButton({tool, activeTool, setActiveTool} : {tool: { name: Tool; icon: React.ElementType; label: string }, activeTool: Tool, setActiveTool: (tool: Tool) => void}) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            'flex-col h-auto py-1 px-2',
                            activeTool === tool.name && 'bg-primary/20 text-primary'
                        )}
                        onClick={() => setActiveTool(tool.name)}
                        >
                        <tool.icon className="h-5 w-5" />
                        <span className="text-xs">{tool.label}</span>
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{tool.label}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

interface ViewPopoverContentProps {
    showGrid: boolean;
    setShowGrid: (show: boolean) => void;
    showRulers: boolean;
    setShowRulers: (show: boolean) => void;
}

function ViewPopoverContent({ showGrid, setShowGrid, showRulers, setShowRulers }: ViewPopoverContentProps) {
    return (
        <div className="space-y-4 p-2">
             <div className="flex items-center justify-between gap-4">
                <Label htmlFor="show-grid" className="flex items-center gap-2"><Grid className="h-4 w-4"/>Show grid</Label>
                <Switch id="show-grid" checked={showGrid} onCheckedChange={setShowGrid} />
            </div>
            <div className="flex items-center justify-between gap-4">
                <Label htmlFor="show-rulers" className="flex items-center gap-2"><Ruler className="h-4 w-4" />Show rulers</Label>
                <Switch id="show-rulers" checked={showRulers} onCheckedChange={setShowRulers} />
            </div>
        </div>
    )
}

interface LayersPopoverProps {
    layers: Layer[];
    activeLayerId: number;
    setActiveLayerId: (id: number) => void;
    addLayer: () => void;
    addLayerGroup: () => void;
    deleteLayer: (id: number) => void;
    duplicateLayer: (id: number) => void;
    mergeLayerDown: (id: number) => void;
    toggleLayerProperty: (id: number, property: keyof Layer) => void;
    setLayerOpacity: (id: number, opacity: number) => void;
    renameLayer: (id: number, newName: string) => void;
    clearLayer: (id: number) => void;
}

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


function LayersPopoverContent({
    layers,
    activeLayerId,
    setActiveLayerId,
    addLayer,
    addLayerGroup,
    deleteLayer,
    duplicateLayer,
    mergeLayerDown,
    toggleLayerProperty,
    setLayerOpacity,
    renameLayer,
    clearLayer,
}: LayersPopoverProps) {
  
  const [renamingLayer, setRenamingLayer] = React.useState<{id: number, name: string} | null>(null);
  const activeLayer = findLayer(layers, activeLayerId);
  const activeLayerIndex = layers.findIndex(l => l.id === activeLayerId);
  const { toast } = useToast();

  const handleRenameSubmit = (id: number) => {
    if (renamingLayer && renamingLayer.id === id && renamingLayer.name) {
      renameLayer(id, renamingLayer.name);
    }
    setRenamingLayer(null);
  };
  
  const handleDoubleClick = (layer: Layer) => {
    setRenamingLayer({ id: layer.id, name: layer.name });
  };
  
  const notImplemented = () => {
    toast({
      title: 'Feature not implemented',
      description: 'This feature is not yet available.',
    });
  };

  const renderLayer = (layer: Layer, level: number) => (
    <div key={layer.id} className="group/item">
      <div
        style={{ paddingLeft: `${level * 16}px` }}
        className={cn(
          "flex items-center gap-2 p-1 rounded-md cursor-pointer hover:bg-accent/50",
          activeLayerId === layer.id && 'bg-accent'
        )}
        onClick={() => setActiveLayerId(layer.id)}
        onDoubleClick={() => handleDoubleClick(layer)}
      >
        {layer.type === 'group' ? (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); toggleLayerProperty(layer.id, 'expanded'); }}>
            {layer.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        ) : <div className="w-6 h-6" />}

        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); toggleLayerProperty(layer.id, 'visible'); }}>
          {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
        </Button>
        
        {layer.type === 'group' ? <Folder className="h-4 w-4" /> : <Layers className="h-4 w-4" />}

        {renamingLayer && renamingLayer.id === layer.id ? (
          <Input
            value={renamingLayer.name}
            onChange={(e) => setRenamingLayer({ ...renamingLayer, name: e.target.value })}
            onBlur={() => handleRenameSubmit(layer.id)}
            onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(layer.id)}
            autoFocus
            className="h-6 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-sm truncate">{layer.name}</span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto opacity-0 group-hover/item:opacity-100 focus:opacity-100">
              <Settings2 className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => mergeLayerDown(layer.id)} disabled={activeLayerIndex >= layers.length - 1}>
                  Merge layer with below <DropdownMenuShortcut>Ctrl+E</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateLayer(layer.id)}>
                  Duplicate <DropdownMenuShortcut>Ctrl+J</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => deleteLayer(layer.id)} disabled={layers.length <= 1}>
                  Delete
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => clearLayer(layer.id)}>
                  Clear <DropdownMenuShortcut>Ctrl+K</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={layer.visible} onCheckedChange={() => toggleLayerProperty(layer.id, 'visible')}>
                  Visible
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={layer.clippingMask} onCheckedChange={() => toggleLayerProperty(layer.id, 'clippingMask')}>
                  Clipping mask
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={layer.lockedAlpha} onCheckedChange={() => toggleLayerProperty(layer.id, 'lockedAlpha')}>
                  Locked alpha
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={layer.locked} onCheckedChange={() => toggleLayerProperty(layer.id, 'locked')}>
                  Locked
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={notImplemented}>
                  Transform... <DropdownMenuShortcut>Ctrl+T</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDoubleClick(layer)}>
                  Rename...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={notImplemented}>
                  Move... <DropdownMenuShortcut>V</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={notImplemented}>
                  Bake opacity
              </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {layer.type === 'group' && layer.expanded && layer.layers && (
        <div className="pl-4 border-l border-dashed ml-3">
          {layer.layers.map(child => renderLayer(child, level + 1))}
        </div>
      )}
    </div>
  );


  return (
    <div className="space-y-2">
        <div className="flex items-center justify-between p-2">
            <div className="flex items-center gap-2">
                <Label>Opacity</Label>
                <Slider 
                    value={[activeLayer?.opacity ?? 100]}
                    onValueChange={(v) => activeLayer && setLayerOpacity(activeLayer.id, v[0])}
                    max={100}
                    step={1}
                    className="w-24"
                    disabled={!activeLayer}
                />
                 <span>{Math.round(activeLayer?.opacity ?? 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
                 <Label>Mode</Label>
                 <Button variant="ghost" size="sm" disabled>Normal</Button>
            </div>
        </div>
        <ScrollArea className="h-48 border rounded-md">
            <div className="space-y-1 p-1">
                {layers.map((layer) => renderLayer(layer, 0))}
            </div>
        </ScrollArea>
        <div className="flex justify-end gap-2 px-1">
            <TooltipProvider>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={addLayer}><Plus /></Button></TooltipTrigger><TooltipContent>New Layer</TooltipContent></Tooltip>
                 <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={addLayerGroup}><FolderPlus /></Button></TooltipTrigger><TooltipContent>New Folder</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => duplicateLayer(activeLayerId)} disabled={!activeLayer}><Copy /></Button></TooltipTrigger><TooltipContent>Duplicate Layer</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => mergeLayerDown(activeLayerId)} disabled={!activeLayer || activeLayerIndex >= layers.length - 1}><Combine /></Button></TooltipTrigger><TooltipContent>Merge Down</TooltipContent></Tooltip>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={() => deleteLayer(activeLayerId)} disabled={layers.length <= 1}><Trash2 /></Button></TooltipTrigger><TooltipContent>Delete Layer</TooltipContent></Tooltip>
            </TooltipProvider>
        </div>
    </div>
  )
}
