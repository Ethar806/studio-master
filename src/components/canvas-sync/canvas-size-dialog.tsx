
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CanvasFrame } from './main-editor';
import { Unit } from './unit-resolution-dialog';

interface CanvasSizeDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSetSize: (width: number, height: number) => void;
  currentSize: CanvasFrame | null;
  unit: Unit;
  ppi: number;
}

const presets = [
    { name: 'Square (1:1)', width: 1080, height: 1080 },
    { name: 'Landscape (16:9)', width: 1920, height: 1080 },
    { name: 'Portrait (4:5)', width: 1080, height: 1350 },
    { name: 'A4 Paper', width: 2480, height: 3508 },
];

export function CanvasSizeDialog({ isOpen, onOpenChange, onSetSize, currentSize, unit, ppi }: CanvasSizeDialogProps) {
  const [width, setWidth] = React.useState(currentSize?.width || 1920);
  const [height, setHeight] = React.useState(currentSize?.height || 1080);
  
  React.useEffect(() => {
    if (isOpen) {
        setWidth(currentSize?.width || 1920);
        setHeight(currentSize?.height || 1080);
    }
  }, [isOpen, currentSize]);

  const handleSetSize = () => {
    onSetSize(width, height);
  };

  const handlePreset = (p: {width: number, height: number}) => {
    setWidth(p.width);
    setHeight(p.height);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Canvas Frame Size</DialogTitle>
          <DialogDescription>
            Define a specific frame for your canvas. This will be used for exporting.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="width" className="text-right">
                Width ({unit})
                </Label>
                <Input
                id="width"
                type="number"
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value, 10))}
                className="col-span-3"
                />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="height" className="text-right">
                Height ({unit})
                </Label>
                <Input
                id="height"
                type="number"
                value={height}
                onChange={(e) => setHeight(parseInt(e.target.value, 10))}
                className="col-span-3"
                />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
                {presets.map(p => (
                    <Button key={p.name} variant="outline" size="sm" onClick={() => handlePreset(p)}>
                        {p.name}
                    </Button>
                ))}
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSetSize}>Set Size</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
