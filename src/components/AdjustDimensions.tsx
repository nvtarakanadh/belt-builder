import { useState, useEffect } from 'react';
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
  // Initialize state from selectedComponent dimensions
  const [length, setLength] = useState<number>(
    selectedComponent.dimensions.length || 100
  );
  const [width, setWidth] = useState<number>(
    selectedComponent.dimensions.width || 100
  );

  // Sync state when selectedComponent changes
  useEffect(() => {
    setLength(selectedComponent.dimensions.length || 100);
    setWidth(selectedComponent.dimensions.width || 100);
  }, [selectedComponent.id, selectedComponent.dimensions.length, selectedComponent.dimensions.width]);

  // Helper function to update dimensions and notify parent
  const updateDimensions = (newLength: number, newWidth: number) => {
    // Clamp values to valid range
    const clampedLength = Math.max(10, Math.min(500, newLength));
    const clampedWidth = Math.max(10, Math.min(500, newWidth));

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

  // Slider handlers
  const handleLengthSliderChange = (values: number[]) => {
    updateDimensions(values[0], width);
  };

  const handleWidthSliderChange = (values: number[]) => {
    updateDimensions(length, values[0]);
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
                {length}
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
                {width}
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

