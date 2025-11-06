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
  const getInitialLength = () => roundAndClamp(selectedComponent.dimensions.length || 100);
  const getInitialWidth = () => roundAndClamp(selectedComponent.dimensions.width || 100);
  
  const [length, setLength] = useState<number>(getInitialLength());
  const [width, setWidth] = useState<number>(getInitialWidth());

  // Sync state when selectedComponent changes
  useEffect(() => {
    const newLength = roundAndClamp(selectedComponent.dimensions.length || 100);
    const newWidth = roundAndClamp(selectedComponent.dimensions.width || 100);
    setLength(newLength);
    setWidth(newWidth);
  }, [selectedComponent.id, selectedComponent.dimensions.length, selectedComponent.dimensions.width]);

  // Use ref to track latest selectedComponent to avoid stale closures
  const componentRef = useRef(selectedComponent);
  useEffect(() => {
    componentRef.current = selectedComponent;
  }, [selectedComponent]);

  // Helper function to update dimensions and notify parent
  const updateDimensions = (newLength: number, newWidth: number) => {
    // Clamp values to valid range and round
    const clampedLength = roundAndClamp(newLength);
    const clampedWidth = roundAndClamp(newWidth);

    console.log('🔧 Updating dimensions:', { clampedLength, clampedWidth });

    setLength(clampedLength);
    setWidth(clampedWidth);

    // Update the component and notify parent - use ref to get latest component
    const currentComponent = componentRef.current;
    const updatedComponent: ConveyorComponent = {
      ...currentComponent,
      dimensions: {
        ...currentComponent.dimensions,
        length: clampedLength,
        width: clampedWidth,
      },
    };

    console.log('🔧 Calling onUpdateComponent with:', updatedComponent);
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
  const lengthRef = useRef<number>(getInitialLength());
  const widthRef = useRef<number>(getInitialWidth());
  
  // Initialize and keep refs in sync with state
  useEffect(() => {
    lengthRef.current = length;
    widthRef.current = width;
  }, [length, width]);

  const handleLengthSliderChange = (values: number[]) => {
    const newLength = roundAndClamp(values[0]);
    updateDimensions(newLength, widthRef.current);
  };

  const handleWidthSliderChange = (values: number[]) => {
    const newWidth = roundAndClamp(values[0]);
    updateDimensions(lengthRef.current, newWidth);
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
                  console.log('🔽 Length decrement clicked, current length:', length);
                  handleLengthDecrement();
                }}
                disabled={length <= 10}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[3rem] text-center">
                {Math.round(length)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🔼 Length increment clicked, current length:', length);
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
            onValueChange={(values) => {
              console.log('📏 Length slider changed to:', values[0]);
              handleLengthSliderChange(values);
            }}
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
                  console.log('🔽 Width decrement clicked, current width:', width);
                  handleWidthDecrement();
                }}
                disabled={width <= 10}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[3rem] text-center">
                {Math.round(width)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 hover:bg-primary hover:text-primary-foreground transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('🔼 Width increment clicked, current width:', width);
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
            onValueChange={(values) => {
              console.log('📏 Width slider changed to:', values[0]);
              handleWidthSliderChange(values);
            }}
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

