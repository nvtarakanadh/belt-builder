import { useState, useEffect, useCallback, useRef } from 'react';
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
  const LENGTH_MIN = 350;   // 0.35m minimum
  const LENGTH_MAX = 4000;  // 4m maximum
  const WIDTH_MIN = 450;    // 0.45m minimum
  const WIDTH_MAX = 500;    // 0.5m maximum
  const HEIGHT_MIN = 300;   // 0.3m minimum
  const HEIGHT_MAX = 1500;  // 1.5m maximum
  const STEP_SIZE = 10;     // 10mm increments for precise adjustments

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
    const val = selectedComponent.dimensions.length || 2175; // Default 2.175m (midpoint of range)
    return roundAndClampLength(val);
  };
  const getInitialWidth = () => {
    const val = selectedComponent.dimensions.width || 475; // Default 0.475m (midpoint of range)
    return roundAndClampWidth(val);
  };
  const getInitialHeight = () => {
    const val = selectedComponent.dimensions.height || 900; // Default 0.9m (midpoint of range)
    return roundAndClampHeight(val);
  };
  
  const [length, setLength] = useState<number>(getInitialLength());
  const [width, setWidth] = useState<number>(getInitialWidth());
  const [height, setHeight] = useState<number>(getInitialHeight());

  // Use refs to track current values and avoid stale closures
  const lengthRef = useRef(length);
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  
  // Update refs when state changes
  useEffect(() => {
    lengthRef.current = length;
  }, [length]);
  
  useEffect(() => {
    widthRef.current = width;
  }, [width]);
  
  useEffect(() => {
    heightRef.current = height;
  }, [height]);
  
  // Helper to update state and ref simultaneously
  const updateLength = useCallback((newValue: number) => {
    // Ensure we're working with a valid number
    const numValue = Number(newValue);
    if (isNaN(numValue) || !isFinite(numValue)) {
      console.warn('Invalid length value:', newValue);
      return lengthRef.current;
    }
    // Validate the value is reasonable (not a huge jump)
    const current = lengthRef.current;
    if (Math.abs(numValue - current) > 1000) {
      console.error('⚠️ Suspicious length jump detected:', { current, new: numValue, diff: Math.abs(numValue - current) });
      return current; // Reject huge jumps
    }
    const clamped = roundAndClampLength(numValue);
    // Only update if value actually changed
    if (clamped !== current) {
      lengthRef.current = clamped;
      setLength(clamped);
    }
    return clamped;
  }, []);
  
  const updateWidth = useCallback((newValue: number) => {
    // Ensure we're working with a valid number
    const numValue = Number(newValue);
    if (isNaN(numValue) || !isFinite(numValue)) {
      console.warn('Invalid width value:', newValue);
      return widthRef.current;
    }
    // Validate the value is reasonable (not a huge jump)
    const current = widthRef.current;
    if (Math.abs(numValue - current) > 100) {
      console.error('⚠️ Suspicious width jump detected:', { current, new: numValue, diff: Math.abs(numValue - current) });
      return current; // Reject huge jumps
    }
    const clamped = roundAndClampWidth(numValue);
    // Only update if value actually changed
    if (clamped !== current) {
      widthRef.current = clamped;
      setWidth(clamped);
    }
    return clamped;
  }, []);
  
  const updateHeight = useCallback((newValue: number) => {
    // Ensure we're working with a valid number
    const numValue = Number(newValue);
    if (isNaN(numValue) || !isFinite(numValue)) {
      console.warn('Invalid height value:', newValue);
      return heightRef.current;
    }
    // Validate the value is reasonable (not a huge jump)
    const current = heightRef.current;
    if (Math.abs(numValue - current) > 500) {
      console.error('⚠️ Suspicious height jump detected:', { current, new: numValue, diff: Math.abs(numValue - current) });
      return current; // Reject huge jumps
    }
    const clamped = roundAndClampHeight(numValue);
    // Only update if value actually changed
    if (clamped !== current) {
      heightRef.current = clamped;
      setHeight(clamped);
    }
    return clamped;
  }, []);

  // Track component ID to detect when component changes
  const [componentId, setComponentId] = useState<string>(selectedComponent.id);
  const isUpdatingRef = useRef(false); // Prevent reset during our own updates

  // Sync state when component ID changes (but NOT when dimensions change)
  useEffect(() => {
    // Only reset if the component ID actually changed, not just dimensions
    if (componentId !== selectedComponent.id && !isUpdatingRef.current) {
      console.log('🔄 Component ID changed, resetting dimensions. Old ID:', componentId, 'New ID:', selectedComponent.id);
      const newLength = getInitialLength();
      const newWidth = getInitialWidth();
      const newHeight = getInitialHeight();
      setLength(newLength);
      setWidth(newWidth);
      setHeight(newHeight);
      lengthRef.current = newLength;
      widthRef.current = newWidth;
      heightRef.current = newHeight;
      setComponentId(selectedComponent.id);
    }
    // DO NOT sync dimensions from props - we control our own state
    // This prevents the parent's dimension updates from resetting our local state
  }, [selectedComponent.id, componentId]);

  // Store selectedComponent in ref to avoid stale closures
  const selectedComponentRef = useRef(selectedComponent);
  useEffect(() => {
    selectedComponentRef.current = selectedComponent;
  }, [selectedComponent]);

  // Update parent component with new dimensions - use refs to get current values
  const notifyParent = useCallback((newLength?: number, newWidth?: number, newHeight?: number) => {
    // Use refs to get the absolute latest values, not closure values
    const clampedLength = newLength !== undefined ? roundAndClampLength(newLength) : roundAndClampLength(lengthRef.current);
    const clampedWidth = newWidth !== undefined ? roundAndClampWidth(newWidth) : roundAndClampWidth(widthRef.current);
    const clampedHeight = newHeight !== undefined ? roundAndClampHeight(newHeight) : roundAndClampHeight(heightRef.current);
    
    // Use the latest selectedComponent from ref, not closure
    const currentComponent = selectedComponentRef.current;
    if (!currentComponent) {
      console.warn('⚠️ Cannot notify parent: selectedComponent is not available');
      return;
    }
    
    const updatedComponent: ConveyorComponent = {
      ...currentComponent,
      dimensions: {
        ...currentComponent.dimensions,
        length: clampedLength,
        width: clampedWidth,
        height: clampedHeight,
      },
    };

    isUpdatingRef.current = true;
    onUpdateComponent(updatedComponent);
    // Reset flag after a brief delay to allow parent update to complete
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 100);
  }, [onUpdateComponent]);

  // Handlers for length
  const handleLengthChange = useCallback((newLength: number) => {
    const clamped = updateLength(newLength);
    notifyParent(clamped, undefined, undefined);
  }, [notifyParent, updateLength]);

  const handleLengthIncrement = useCallback(() => {
    const currentLength = lengthRef.current;
    // Ensure we're working with a valid number
    if (isNaN(currentLength) || currentLength === undefined || currentLength === null || !isFinite(currentLength)) {
      console.error('Invalid current length:', currentLength);
      return;
    }
    // Calculate new value exactly - ensure it's a simple addition
    const numCurrent = Number(currentLength);
    const newValue = numCurrent + STEP_SIZE;
    
    // Validate the increment is reasonable
    if (newValue - numCurrent !== STEP_SIZE) {
      console.error('⚠️ Math error in increment:', { current: numCurrent, step: STEP_SIZE, result: newValue });
      return;
    }
    
    console.log('📏 Length increment:', { current: numCurrent, step: STEP_SIZE, new: newValue });
    const clamped = updateLength(newValue);
    console.log('📏 Length after clamp:', clamped);
    
    // Only notify if value actually changed and is within bounds
    if (clamped !== numCurrent && clamped >= LENGTH_MIN && clamped <= LENGTH_MAX) {
      notifyParent(clamped, undefined, undefined);
    } else {
      console.warn('📏 Length increment skipped:', { clamped, currentLength: numCurrent, min: LENGTH_MIN, max: LENGTH_MAX });
    }
  }, [notifyParent, updateLength]);

  const handleLengthDecrement = useCallback(() => {
    const currentLength = lengthRef.current;
    // Ensure we're working with a valid number
    if (isNaN(currentLength) || currentLength === undefined || currentLength === null || !isFinite(currentLength)) {
      console.error('Invalid current length:', currentLength);
      return;
    }
    // Calculate new value exactly - ensure it's a simple subtraction
    const numCurrent = Number(currentLength);
    const newValue = numCurrent - STEP_SIZE;
    
    // Validate the decrement is reasonable
    if (numCurrent - newValue !== STEP_SIZE) {
      console.error('⚠️ Math error in decrement:', { current: numCurrent, step: STEP_SIZE, result: newValue });
      return;
    }
    
    console.log('📏 Length decrement:', { current: numCurrent, step: STEP_SIZE, new: newValue });
    const clamped = updateLength(newValue);
    console.log('📏 Length after clamp:', clamped);
    
    // Only notify if value actually changed and is within bounds
    if (clamped !== numCurrent && clamped >= LENGTH_MIN && clamped <= LENGTH_MAX) {
      notifyParent(clamped, undefined, undefined);
    } else {
      console.warn('📏 Length decrement skipped:', { clamped, currentLength: numCurrent, min: LENGTH_MIN, max: LENGTH_MAX });
    }
  }, [notifyParent, updateLength]);

  const handleLengthSliderChange = (values: number[]) => {
    handleLengthChange(values[0]);
  };

  // Handlers for width
  const handleWidthChange = useCallback((newWidth: number) => {
    const clamped = updateWidth(newWidth);
    notifyParent(undefined, clamped, undefined);
  }, [notifyParent, updateWidth]);

  const handleWidthIncrement = useCallback(() => {
    const currentWidth = widthRef.current;
    // Ensure we're working with a valid number
    if (isNaN(currentWidth) || currentWidth === undefined || currentWidth === null || !isFinite(currentWidth)) {
      console.error('Invalid current width:', currentWidth);
      return;
    }
    // Calculate new value exactly - ensure it's a simple addition
    const numCurrent = Number(currentWidth);
    const newValue = numCurrent + STEP_SIZE;
    
    // Validate the increment is reasonable
    if (newValue - numCurrent !== STEP_SIZE) {
      console.error('⚠️ Math error in increment:', { current: numCurrent, step: STEP_SIZE, result: newValue });
      return;
    }
    
    console.log('📏 Width increment:', { current: numCurrent, step: STEP_SIZE, new: newValue });
    const clamped = updateWidth(newValue);
    console.log('📏 Width after clamp:', clamped);
    
    // Only notify if value actually changed and is within bounds
    if (clamped !== numCurrent && clamped >= WIDTH_MIN && clamped <= WIDTH_MAX) {
      notifyParent(undefined, clamped, undefined);
    } else {
      console.warn('📏 Width increment skipped:', { clamped, currentWidth: numCurrent, min: WIDTH_MIN, max: WIDTH_MAX });
    }
  }, [notifyParent, updateWidth]);

  const handleWidthDecrement = useCallback(() => {
    const currentWidth = widthRef.current;
    // Ensure we're working with a valid number
    if (isNaN(currentWidth) || currentWidth === undefined || currentWidth === null || !isFinite(currentWidth)) {
      console.error('Invalid current width:', currentWidth);
      return;
    }
    // Calculate new value exactly - ensure it's a simple subtraction
    const numCurrent = Number(currentWidth);
    const newValue = numCurrent - STEP_SIZE;
    
    // Validate the decrement is reasonable
    if (numCurrent - newValue !== STEP_SIZE) {
      console.error('⚠️ Math error in decrement:', { current: numCurrent, step: STEP_SIZE, result: newValue });
      return;
    }
    
    console.log('📏 Width decrement:', { current: numCurrent, step: STEP_SIZE, new: newValue });
    const clamped = updateWidth(newValue);
    console.log('📏 Width after clamp:', clamped);
    
    // Only notify if value actually changed and is within bounds
    if (clamped !== numCurrent && clamped >= WIDTH_MIN && clamped <= WIDTH_MAX) {
      notifyParent(undefined, clamped, undefined);
    } else {
      console.warn('📏 Width decrement skipped:', { clamped, currentWidth: numCurrent, min: WIDTH_MIN, max: WIDTH_MAX });
    }
  }, [notifyParent, updateWidth]);

  const handleWidthSliderChange = (values: number[]) => {
    handleWidthChange(values[0]);
  };

  // Handlers for height
  const handleHeightChange = useCallback((newHeight: number) => {
    const clamped = updateHeight(newHeight);
    notifyParent(undefined, undefined, clamped);
  }, [notifyParent, updateHeight]);

  const handleHeightIncrement = useCallback(() => {
    const currentHeight = heightRef.current;
    // Ensure we're working with a valid number
    if (isNaN(currentHeight) || currentHeight === undefined || currentHeight === null || !isFinite(currentHeight)) {
      console.error('Invalid current height:', currentHeight);
      return;
    }
    // Calculate new value exactly - ensure it's a simple addition
    const numCurrent = Number(currentHeight);
    const newValue = numCurrent + STEP_SIZE;
    
    // Validate the increment is reasonable
    if (newValue - numCurrent !== STEP_SIZE) {
      console.error('⚠️ Math error in increment:', { current: numCurrent, step: STEP_SIZE, result: newValue });
      return;
    }
    
    console.log('📏 Height increment:', { current: numCurrent, step: STEP_SIZE, new: newValue });
    const clamped = updateHeight(newValue);
    console.log('📏 Height after clamp:', clamped);
    
    // Only notify if value actually changed and is within bounds
    if (clamped !== numCurrent && clamped >= HEIGHT_MIN && clamped <= HEIGHT_MAX) {
      notifyParent(undefined, undefined, clamped);
    } else {
      console.warn('📏 Height increment skipped:', { clamped, currentHeight: numCurrent, min: HEIGHT_MIN, max: HEIGHT_MAX });
    }
  }, [notifyParent, updateHeight]);

  const handleHeightDecrement = useCallback(() => {
    const currentHeight = heightRef.current;
    // Ensure we're working with a valid number
    if (isNaN(currentHeight) || currentHeight === undefined || currentHeight === null || !isFinite(currentHeight)) {
      console.error('Invalid current height:', currentHeight);
      return;
    }
    // Calculate new value exactly - ensure it's a simple subtraction
    const numCurrent = Number(currentHeight);
    const newValue = numCurrent - STEP_SIZE;
    
    // Validate the decrement is reasonable
    if (numCurrent - newValue !== STEP_SIZE) {
      console.error('⚠️ Math error in decrement:', { current: numCurrent, step: STEP_SIZE, result: newValue });
      return;
    }
    
    console.log('📏 Height decrement:', { current: numCurrent, step: STEP_SIZE, new: newValue });
    const clamped = updateHeight(newValue);
    console.log('📏 Height after clamp:', clamped);
    
    // Only notify if value actually changed and is within bounds
    if (clamped !== numCurrent && clamped >= HEIGHT_MIN && clamped <= HEIGHT_MAX) {
      notifyParent(undefined, undefined, clamped);
    } else {
      console.warn('📏 Height decrement skipped:', { clamped, currentHeight: numCurrent, min: HEIGHT_MIN, max: HEIGHT_MAX });
    }
  }, [notifyParent, updateHeight]);

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
            min={WIDTH_MIN}
            max={WIDTH_MAX}
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
              min={HEIGHT_MIN}
              max={HEIGHT_MAX}
              step={STEP_SIZE}
              className="w-full"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
