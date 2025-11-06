import { useState, useEffect, useCallback } from 'react';
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

  // Initialize state from selectedComponent dimensions
  const getInitialLength = () => roundAndClamp(selectedComponent.dimensions.length || 100);
  const getInitialWidth = () => roundAndClamp(selectedComponent.dimensions.width || 100);
  
  const [length, setLength] = useState<number>(getInitialLength());
  const [width, setWidth] = useState<number>(getInitialWidth());

  // Track component ID to detect when component changes
  const [componentId, setComponentId] = useState<string>(selectedComponent.id);

  // Sync state when component ID changes
  useEffect(() => {
    if (componentId !== selectedComponent.id) {
      const newLength = roundAndClamp(selectedComponent.dimensions.length || 100);
      const newWidth = roundAndClamp(selectedComponent.dimensions.width || 100);
      setLength(newLength);
      setWidth(newWidth);
      setComponentId(selectedComponent.id);
    }
  }, [selectedComponent.id, componentId]);

  // Update parent component with new dimensions
  const notifyParent = useCallback((newLength: number, newWidth: number) => {
    const clampedLength = roundAndClamp(newLength);
    const clampedWidth = roundAndClamp(newWidth);

    const updatedComponent: ConveyorComponent = {
      ...selectedComponent,
      dimensions: {
        ...selectedComponent.dimensions,
        length: clampedLength,
        width: clampedWidth,
      },
    };

    onUpdateComponent(updatedComponent);
  }, [selectedComponent, onUpdateComponent]);

  // Handlers for length
  const handleLengthChange = useCallback((newLength: number) => {
    const clamped = roundAndClamp(newLength);
    setLength(clamped);
    notifyParent(clamped, width);
  }, [width, notifyParent]);

  const handleLengthIncrement = () => {
    handleLengthChange(length + 1);
  };

  const handleLengthDecrement = () => {
    handleLengthChange(length - 1);
  };

  const handleLengthSliderChange = (values: number[]) => {
    handleLengthChange(values[0]);
  };

  // Handlers for width
  const handleWidthChange = useCallback((newWidth: number) => {
    const clamped = roundAndClamp(newWidth);
    setWidth(clamped);
    notifyParent(length, clamped);
  }, [length, notifyParent]);

  const handleWidthIncrement = () => {
    handleWidthChange(width + 1);
  };

  const handleWidthDecrement = () => {
    handleWidthChange(width - 1);
  };

  const handleWidthSliderChange = (values: number[]) => {
    handleWidthChange(values[0]);
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
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleLengthDecrement();
                }}
                disabled={length <= 10}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[3rem] text-center">
                {length}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleLengthIncrement();
                }}
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
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleWidthDecrement();
                }}
                disabled={width <= 10}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[3rem] text-center">
                {width}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleWidthIncrement();
                }}
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
