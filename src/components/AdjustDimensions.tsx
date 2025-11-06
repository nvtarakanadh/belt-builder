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
  // Realistic ranges for industrial conveyor components (in mm)
  const LENGTH_MIN = 500;   // 0.5m minimum
  const LENGTH_MAX = 20000; // 20m maximum
  const WIDTH_MIN = 300;    // 0.3m minimum
  const WIDTH_MAX = 3000;   // 3m maximum
  const HEIGHT_MIN = 100;   // 0.1m minimum
  const HEIGHT_MAX = 2000;  // 2m maximum
  const STEP_SIZE = 50;     // 50mm increments for realistic adjustments

  // Helper to round and clamp values for length
  const roundAndClampLength = (value: number): number => {
    return Math.max(LENGTH_MIN, Math.min(LENGTH_MAX, Math.round(value / STEP_SIZE) * STEP_SIZE));
  };

  // Helper to round and clamp values for width
  const roundAndClampWidth = (value: number): number => {
    return Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, Math.round(value / STEP_SIZE) * STEP_SIZE));
  };

  // Helper to round and clamp values for height
  const roundAndClampHeight = (value: number): number => {
    return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, Math.round(value / STEP_SIZE) * STEP_SIZE));
  };

  // Initialize state from selectedComponent dimensions
  const getInitialLength = () => {
    const val = selectedComponent.dimensions.length || 6000; // Default 6m
    return roundAndClampLength(val);
  };
  const getInitialWidth = () => {
    const val = selectedComponent.dimensions.width || 1200; // Default 1.2m
    return roundAndClampWidth(val);
  };
  const getInitialHeight = () => {
    const val = selectedComponent.dimensions.height || 300; // Default 0.3m
    return roundAndClampHeight(val);
  };
  
  const [length, setLength] = useState<number>(getInitialLength());
  const [width, setWidth] = useState<number>(getInitialWidth());
  const [height, setHeight] = useState<number>(getInitialHeight());

  // Track component ID to detect when component changes
  const [componentId, setComponentId] = useState<string>(selectedComponent.id);

  // Sync state when component ID changes
  useEffect(() => {
    if (componentId !== selectedComponent.id) {
      const newLength = getInitialLength();
      const newWidth = getInitialWidth();
      const newHeight = getInitialHeight();
      setLength(newLength);
      setWidth(newWidth);
      setHeight(newHeight);
      setComponentId(selectedComponent.id);
    }
  }, [selectedComponent.id, componentId]);

  // Update parent component with new dimensions
  const notifyParent = useCallback((newLength: number, newWidth: number, newHeight?: number) => {
    const clampedLength = roundAndClampLength(newLength);
    const clampedWidth = roundAndClampWidth(newWidth);
    const clampedHeight = newHeight !== undefined ? roundAndClampHeight(newHeight) : height;

    const updatedComponent: ConveyorComponent = {
      ...selectedComponent,
      dimensions: {
        ...selectedComponent.dimensions,
        length: clampedLength,
        width: clampedWidth,
        height: clampedHeight,
      },
    };

    onUpdateComponent(updatedComponent);
  }, [selectedComponent, onUpdateComponent, height]);

  // Handlers for length
  const handleLengthChange = useCallback((newLength: number) => {
    const clamped = roundAndClampLength(newLength);
    setLength(clamped);
    notifyParent(clamped, width, height);
  }, [width, height, notifyParent]);

  const handleLengthIncrement = () => {
    handleLengthChange(length + STEP_SIZE);
  };

  const handleLengthDecrement = () => {
    handleLengthChange(length - STEP_SIZE);
  };

  const handleLengthSliderChange = (values: number[]) => {
    handleLengthChange(values[0]);
  };

  // Handlers for width
  const handleWidthChange = useCallback((newWidth: number) => {
    const clamped = roundAndClampWidth(newWidth);
    setWidth(clamped);
    notifyParent(length, clamped, height);
  }, [length, height, notifyParent]);

  const handleWidthIncrement = () => {
    handleWidthChange(width + STEP_SIZE);
  };

  const handleWidthDecrement = () => {
    handleWidthChange(width - STEP_SIZE);
  };

  const handleWidthSliderChange = (values: number[]) => {
    handleWidthChange(values[0]);
  };

  // Handlers for height
  const handleHeightChange = useCallback((newHeight: number) => {
    const clamped = roundAndClampHeight(newHeight);
    setHeight(clamped);
    notifyParent(length, width, clamped);
  }, [length, width, notifyParent]);

  const handleHeightIncrement = () => {
    handleHeightChange(height + STEP_SIZE);
  };

  const handleHeightDecrement = () => {
    handleHeightChange(height - STEP_SIZE);
  };

  const handleHeightSliderChange = (values: number[]) => {
    handleHeightChange(values[0]);
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
                disabled={length <= LENGTH_MIN}
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
                disabled={length >= LENGTH_MAX}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Slider
            value={[length]}
            onValueChange={handleLengthSliderChange}
            min={LENGTH_MIN}
            max={LENGTH_MAX}
            step={STEP_SIZE}
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
                disabled={width <= WIDTH_MIN}
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
                disabled={width >= WIDTH_MAX}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Slider
            value={[width]}
            onValueChange={handleWidthSliderChange}
            min={LENGTH_MIN}
            max={LENGTH_MAX}
            step={STEP_SIZE}
            className="w-full"
          />
        </div>

        {/* Height Control */}
        {selectedComponent.dimensions.height !== undefined && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Height (mm)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleHeightDecrement();
                  }}
                  disabled={height <= HEIGHT_MIN}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[3rem] text-center">
                  {height}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleHeightIncrement();
                  }}
                  disabled={height >= HEIGHT_MAX}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Slider
              value={[height]}
              onValueChange={handleHeightSliderChange}
              min={10}
              max={500}
              step={1}
              className="w-full"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
