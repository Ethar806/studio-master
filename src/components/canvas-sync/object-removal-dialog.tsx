'use client';

import { useState, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { removeObject, type RemoveObjectInput } from '@/ai/flows/remove-object';
import { Image as ImageIcon, Loader2, UploadCloud } from 'lucide-react';
import Image from 'next/image';

interface ObjectRemovalDialogProps {
  isOpen: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
}

export function ObjectRemovalDialog({ isOpen, onOpenChange }: ObjectRemovalDialogProps) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [mask, setMask] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const photoInputRef = useRef<HTMLInputElement>(null);
  const maskInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setPhoto(null);
    setMask(null);
    setResult(null);
    setIsLoading(false);
  };

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    setter: Dispatch<SetStateAction<string | null>>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setter(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveObject = async () => {
    if (!photo || !mask) {
      toast({
        variant: 'destructive',
        title: 'Missing Images',
        description: 'Please upload both a photo and a mask.',
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const input: RemoveObjectInput = {
        photoDataUri: photo,
        maskDataUri: mask,
      };
      const response = await removeObject(input);
      setResult(response.generatedImage);
    } catch (error) {
      console.error('AI Object Removal Failed:', error);
      toast({
        variant: 'destructive',
        title: 'AI Error',
        description: 'Could not remove the object. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) resetState();
        onOpenChange(open);
    }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>AI-Powered Object Removal</DialogTitle>
          <DialogDescription>
            Upload a photo and a mask image. The AI will remove the object indicated by the mask.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-center">1. Upload Photo</h3>
            <FileUpload a_id="photo" file={photo} fileInputRef={photoInputRef} handleFileChange={(e) => handleFileChange(e, setPhoto)} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-center">2. Upload Mask</h3>
            <FileUpload a_id="mask" file={mask} fileInputRef={maskInputRef} handleFileChange={(e) => handleFileChange(e, setMask)} />
          </div>
        </div>
        
        {result && (
            <div className="space-y-2">
                <h3 className="font-semibold text-center">Result</h3>
                <div className="aspect-square w-full rounded-md border-2 border-dashed flex items-center justify-center p-2 bg-muted/50">
                    <div className="relative w-full h-full">
                         <Image src={result} alt="Generated result" layout="fill" objectFit="contain" />
                    </div>
                </div>
            </div>
        )}

        <DialogFooter>
          {result ? (
            <>
                <Button variant="outline" onClick={resetState}>Start Over</Button>
                <Button onClick={() => onOpenChange(false)}>Accept & Close</Button>
            </>
          ) : (
             <Button onClick={handleRemoveObject} disabled={!photo || !mask || isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Remove Object'
                )}
             </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function FileUpload({a_id, file, fileInputRef, handleFileChange} : {a_id: string, file: string | null, fileInputRef: React.RefObject<HTMLInputElement>, handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void}) {
    return (
        <div className="aspect-square w-full rounded-md border-2 border-dashed flex items-center justify-center p-2 bg-muted/50 relative">
            {file ? (
                <div className="relative w-full h-full">
                    <Image src={file} alt={a_id} layout="fill" objectFit="contain" />
                </div>
            ) : (
                <div className="text-center text-muted-foreground cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                    <UploadCloud className="mx-auto h-10 w-10" />
                    <p>Click to upload</p>
                </div>
            )}
             <Input
                id={`input-${a_id}`}
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFileChange}
              />
        </div>
    )
}
