import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { ConveyorComponent } from '@/types/conveyor';

interface AdjustDimensionsProps {
  selectedComponent: ConveyorComponent;
  onUpdateComponent: (component: ConveyorComponent) => void;
}

export const AdjustDimensions = ({ selectedComponent, onUpdateComponent }: AdjustDimensionsProps) => {
  // Helper to round and clamp values
  const roundAndClamp = (value: number): number => {
    return Math.max(10, Math.min(500, Math.round(value)));
  };

  // Initialize state from selectedComponent dimensions (rounded)
  const initialLength = roundAndClamp(selectedComponent.dimensions.length || 100);
  const initialWidth = roundAndClamp(selectedComponent.dimensions.width || 100);
  
  const [length, setLength] = useState<number>(initialLength);
  const [width, setWidth] = useState<number>(initialWidth);

  // Sync state when selectedComponent changes
  useEffect(() => {
    const newLength = roundAndClamp(selectedComponent.dimensions.length || 100);
    const newWidth = roundAndClamp(selectedComponent.dimensions.width || 100);
    setLength(newLength);
    setWidth(newWidth);
  }, [selectedComponent.id, selectedComponent.dimensions.length, selectedComponent.dimensions.width]);

  // Helper function to update dimensions and notify parent
  const updateDimensions = (newLength: number, newWidth: number) => {
    // Clamp values to valid range and round
    const clampedLength = roundAndClamp(newLength);
    const clampedWidth = roundAndClamp(newWidth);

    setLength(clampedLength);
    setWidth(clampedWidth);

    // Update the component and notify parent
    const updatedComponent: ConveyorComponent = {
      ...selectedComponent,
      dimensions: {
        ...selectedComponent.dimensions,
        length: clampedLength,
        width: clampedWidth,
      },
    };

    onUpdateComponent(updatedComponent);
  };

  // Increment/Decrement handlers
  const handleLengthIncrement = () => {
    updateDimensions(length + 1, width);
  };

  const handleLengthDecrement = () => {
    updateDimensions(length - 1, width);
  };

  const handleWidthIncrement = () => {
    updateDimensions(length, width + 1);
  };

  const handleWidthDecrement = () => {
    updateDimensions(length, width - 1);
  };

  // Slider handlers - using refs to avoid stale closure issues
  const lengthRef = useRef<number>(length);
  const widthRef = useRef<number>(width);
  
  // Initialize and keep refs in sync with state
  useEffect(() => {
    lengthRef.current = length;
    widthRef.current = width;
  }, [length, width]);
  
  // Initialize refs on mount
  useEffect(() => {
    lengthRef.current = initialLength;
    widthRef.current = initialWidth;
  }, []);

  const handleLengthSliderChange = (values: number[]) => {
    const newLength = roundAndClamp(values[0]);
    setLength(newLength);
    
    // Update component with current width from ref
    const updatedComponent: ConveyorComponent = {
      ...selectedComponent,
      dimensions: {
        ...selectedComponent.dimensions,
        length: newLength,
        width: widthRef.current,
      },
    };
    onUpdateComponent(updatedComponent);
  };

  const handleWidthSliderChange = (values: number[]) => {
    const newWidth = roundAndClamp(values[0]);
    setWidth(newWidth);
    
    // Update component with current length from ref
    const updatedComponent: ConveyorComponent = {
      ...selectedComponent,
      dimensions: {
        ...selectedComponent.dimensions,
        length: lengthRef.current,
        width: newWidth,
      },
    };
    onUpdateComponent(updatedComponent);
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Adjust Dimensions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Length Control */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Length (mm)</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={handleLengthDecrement}
                disabled={length <= 10}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[3rem] text-center">
                {Math.round(length)}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={handleLengthIncrement}
                disabled={length >= 500}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Slider
            value={[length]}
            onValueChange={handleLengthSliderChange}
            min={10}
            max={500}
            step={1}
            className="w-full"
          />
        </div>

        {/* Width Control */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Width (mm)</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={handleWidthDecrement}
                disabled={width <= 10}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[3rem] text-center">
                {Math.round(width)}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={handleWidthIncrement}
                disabled={width >= 500}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Slider
            value={[width]}
            onValueChange={handleWidthSliderChange}
            min={10}
            max={500}
            step={1}
            className="w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
};

