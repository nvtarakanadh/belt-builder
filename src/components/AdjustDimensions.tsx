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
  // Check if component is locked - if so, disable dimension editing
  const isLocked = selectedComponent.isLocked || false;
  
  // Detect if this is a Vertical Rod or Horizontal Rod
  const componentName = (selectedComponent.name || '').toLowerCase();
  const componentCategory = (selectedComponent.type || '').toLowerCase();
  const isRod = componentName.includes('rod') || componentCategory.includes('rod');
  const isVerticalRod = (componentName.includes('vertical') && isRod) || (componentCategory.includes('vertical') && isRod);
  const isHorizontalRod = (componentName.includes('horizontal') && isRod) || (componentCategory.includes('horizontal') && isRod);
  const isRodType = isVerticalRod || isHorizontalRod;
  
  // Realistic ranges for industrial conveyor components (in mm)
  const LENGTH_MIN = 350;   // 0.35m minimum
  const LENGTH_MAX = 4000;  // 4m maximum
  const WIDTH_MIN = 450;    // 0.45m minimum
  const WIDTH_MAX = 500;    // 0.5m maximum
  const HEIGHT_MIN = 300;   // 0.3m minimum
  const HEIGHT_MAX = 1500;  // 1.5m maximum
  const STEP_SIZE = 1;     // 1mm increments for precise adjustments

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
    // For vertical rods, use height dimension; for others, use length
    let val;
    if (isVerticalRod) {
      val = selectedComponent.dimensions?.height;
    } else {
      val = selectedComponent.dimensions?.length;
    }
    if (val !== undefined && val !== null && val > 0) {
      return roundAndClampLength(val);
    }
    // Default to midpoint of range if no dimension provided
    return roundAndClampLength((LENGTH_MIN + LENGTH_MAX) / 2);
  };
  
  const getInitialWidth = () => {
    // For rods, preserve width from dimensions
    const val = selectedComponent.dimensions?.width;
    if (val !== undefined && val !== null && val > 0) {
      return roundAndClampWidth(val);
    }
    // For rods, use a small default width; for others, use midpoint
    return isRodType ? roundAndClampWidth(50) : roundAndClampWidth((WIDTH_MIN + WIDTH_MAX) / 2);
  };
  
  const getInitialHeight = () => {
    // For rods, preserve height from dimensions (but vertical rods use length slider)
    const val = selectedComponent.dimensions?.height;
    if (val !== undefined && val !== null && val > 0) {
      return roundAndClampHeight(val);
    }
    // For rods, use a small default height; for others, use midpoint
    return isRodType ? roundAndClampHeight(50) : roundAndClampHeight((HEIGHT_MIN + HEIGHT_MAX) / 2);
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
      return lengthRef.current;
    }
    const clamped = roundAndClampLength(numValue);
    // Always update ref and state immediately for instant UI feedback
    lengthRef.current = clamped;
    setLength(clamped);
    return clamped;
  }, []);
  
  const updateWidth = useCallback((newValue: number) => {
    // Ensure we're working with a valid number
    const numValue = Number(newValue);
    if (isNaN(numValue) || !isFinite(numValue)) {
      return widthRef.current;
    }
    const clamped = roundAndClampWidth(numValue);
    // Always update ref and state immediately for instant UI feedback
    widthRef.current = clamped;
    setWidth(clamped);
    return clamped;
  }, []);
  
  const updateHeight = useCallback((newValue: number) => {
    // Ensure we're working with a valid number
    const numValue = Number(newValue);
    if (isNaN(numValue) || !isFinite(numValue)) {
      return heightRef.current;
    }
    const clamped = roundAndClampHeight(numValue);
    // Always update ref and state immediately for instant UI feedback
    heightRef.current = clamped;
    setHeight(clamped);
    return clamped;
  }, []);

  // Track component ID to detect when component changes
  const [componentId, setComponentId] = useState<string>(selectedComponent.id);
  const isUpdatingRef = useRef(false); // Prevent reset during our own updates
  const lastNotifiedDimensionsRef = useRef<{length?: number, width?: number, height?: number}>({});

  // Sync state when component ID changes (but NOT when dimensions change)
  useEffect(() => {
    // Only reset if the component ID actually changed, not just dimensions
    if (componentId !== selectedComponent.id && !isUpdatingRef.current) {
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
      // Initialize lastNotifiedDimensionsRef with current values to prevent false validation failures
      lastNotifiedDimensionsRef.current = {
        length: newLength,
        width: newWidth,
        height: newHeight
      };
    }
    // DO NOT sync dimensions from props - we control our own state
    // This prevents the parent's dimension updates from resetting our local state
  }, [selectedComponent.id, componentId]);

  // Store selectedComponent in ref to avoid stale closures
  const selectedComponentRef = useRef(selectedComponent);
  useEffect(() => {
    selectedComponentRef.current = selectedComponent;
    // Only sync from parent if we're not currently updating (to prevent feedback loop)
    // And only if the component ID matches
    if (selectedComponent.id === componentId && !isUpdatingRef.current) {
      // Sync dimensions from parent only if they're significantly different
      // This prevents unnecessary re-renders while still allowing external updates
      // For vertical rods, sync from height; for others, sync from length
      const currentName = (selectedComponent.name || '').toLowerCase();
      const currentCategory = (selectedComponent.type || '').toLowerCase();
      const currentIsRod = currentName.includes('rod') || currentCategory.includes('rod');
      const currentIsVerticalRod = (currentName.includes('vertical') && currentIsRod) || (currentCategory.includes('vertical') && currentIsRod);
      
      const dimensionToSync = currentIsVerticalRod 
        ? selectedComponent.dimensions.height 
        : selectedComponent.dimensions.length;
      
      if (dimensionToSync !== undefined) {
        const newLength = roundAndClampLength(dimensionToSync);
        // Only update if the difference is significant (more than step size)
        if (Math.abs(newLength - lengthRef.current) > STEP_SIZE / 2) {
          lengthRef.current = newLength;
          setLength(newLength);
        }
      }
      // Don't sync width/height for rods to prevent flickering
      if (!currentIsRod && selectedComponent.dimensions.width !== undefined) {
        const newWidth = roundAndClampWidth(selectedComponent.dimensions.width);
        if (Math.abs(newWidth - widthRef.current) > STEP_SIZE / 2) {
          widthRef.current = newWidth;
          setWidth(newWidth);
        }
      }
      // Don't sync height for rods (it's controlled by length slider for vertical rods)
      if (!currentIsRod && selectedComponent.dimensions.height !== undefined) {
        const newHeight = roundAndClampHeight(selectedComponent.dimensions.height);
        if (Math.abs(newHeight - heightRef.current) > STEP_SIZE / 2) {
          heightRef.current = newHeight;
          setHeight(newHeight);
        }
      }
      
      // Sync lastNotifiedDimensionsRef to match current dimensions
      lastNotifiedDimensionsRef.current = {
        length: selectedComponent.dimensions.length !== undefined 
          ? roundAndClampLength(selectedComponent.dimensions.length) 
          : lastNotifiedDimensionsRef.current.length,
        width: selectedComponent.dimensions.width !== undefined 
          ? roundAndClampWidth(selectedComponent.dimensions.width) 
          : lastNotifiedDimensionsRef.current.width,
        height: selectedComponent.dimensions.height !== undefined 
          ? roundAndClampHeight(selectedComponent.dimensions.height) 
          : lastNotifiedDimensionsRef.current.height
      };
    }
  }, [selectedComponent, componentId]);

  // Update parent component with new dimensions - use refs to get current values
  const notifyParent = useCallback((newLength?: number, newWidth?: number, newHeight?: number) => {
    // Use refs to get the absolute latest values, not closure values
    const clampedLength = newLength !== undefined ? roundAndClampLength(newLength) : roundAndClampLength(lengthRef.current);
    const clampedWidth = newWidth !== undefined ? roundAndClampWidth(newWidth) : roundAndClampWidth(widthRef.current);
    const clampedHeight = newHeight !== undefined ? roundAndClampHeight(newHeight) : roundAndClampHeight(heightRef.current);
    
    // Use the latest selectedComponent from ref, not closure
    const currentComponent = selectedComponentRef.current;
    if (!currentComponent) {
      return;
    }
    
    // For rods, only update length and preserve existing width/height
    const currentName = (currentComponent.name || '').toLowerCase();
    const currentCategory = (currentComponent.type || '').toLowerCase();
    const currentIsRod = currentName.includes('rod') || currentCategory.includes('rod');
    const currentIsVerticalRod = (currentName.includes('vertical') && currentIsRod) || (currentCategory.includes('vertical') && currentIsRod);
    const currentIsHorizontalRod = (currentName.includes('horizontal') && currentIsRod) || (currentCategory.includes('horizontal') && currentIsRod);
    const currentIsRodType = currentIsVerticalRod || currentIsHorizontalRod;
    
    // Store what we're about to notify BEFORE calling onUpdateComponent
    lastNotifiedDimensionsRef.current = {
      length: clampedLength,
      width: clampedWidth,
      height: clampedHeight
    };
    
    // For rods, we need to preserve the dimensions that aren't being changed
    // Get the current dimensions, ensuring we have valid values
    const currentWidth = currentComponent.dimensions?.width;
    const currentHeight = currentComponent.dimensions?.height;
    const currentLength = currentComponent.dimensions?.length;
    
    const updatedComponent: ConveyorComponent = {
      ...currentComponent,
      dimensions: {
        ...currentComponent.dimensions,
        // For vertical rods: update height, preserve width and length from current dimensions
        // For horizontal rods: update length, preserve width and height from current dimensions
        // For other components: update all dimensions
        length: currentIsVerticalRod 
          ? (currentLength !== undefined && currentLength !== null ? currentLength : 50) // Preserve length for vertical rods
          : (currentIsHorizontalRod ? clampedLength : clampedLength),
        width: currentIsRodType 
          ? (currentWidth !== undefined && currentWidth !== null ? currentWidth : 50) // Preserve width for all rods
          : clampedWidth,
        height: currentIsVerticalRod 
          ? clampedLength // Update height for vertical rods (slider value maps to height)
          : (currentIsHorizontalRod ? (currentHeight !== undefined && currentHeight !== null ? currentHeight : 50) : clampedHeight), // Preserve height for horizontal rods
      },
    };
    
    // Set flag to prevent feedback loop
    isUpdatingRef.current = true;
    onUpdateComponent(updatedComponent);
    // Reset flag after parent has processed the update
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
    if (isNaN(currentLength) || currentLength === undefined || currentLength === null || !isFinite(currentLength)) {
      return;
    }
    const numCurrent = Number(currentLength);
    const newValue = numCurrent + STEP_SIZE;
    
    if (newValue - numCurrent !== STEP_SIZE) {
      return;
    }
    
    // Update state immediately for instant UI feedback
    const clamped = updateLength(newValue);
    
    // Update lastNotifiedDimensionsRef immediately to prevent validation issues
    lastNotifiedDimensionsRef.current = {
      ...lastNotifiedDimensionsRef.current,
      length: clamped
    };
    
    if (clamped !== numCurrent && clamped >= LENGTH_MIN && clamped <= LENGTH_MAX) {
      notifyParent(clamped, undefined, undefined);
    }
  }, [notifyParent, updateLength]);

  const handleLengthDecrement = useCallback(() => {
    const currentLength = lengthRef.current;
    if (isNaN(currentLength) || currentLength === undefined || currentLength === null || !isFinite(currentLength)) {
      return;
    }
    const numCurrent = Number(currentLength);
    const newValue = numCurrent - STEP_SIZE;
    
    if (numCurrent - newValue !== STEP_SIZE) {
      return;
    }
    
    // Update state immediately for instant UI feedback
    const clamped = updateLength(newValue);
    
    // Update lastNotifiedDimensionsRef immediately to prevent validation issues
    lastNotifiedDimensionsRef.current = {
      ...lastNotifiedDimensionsRef.current,
      length: clamped
    };
    
    if (clamped !== numCurrent && clamped >= LENGTH_MIN && clamped <= LENGTH_MAX) {
      notifyParent(clamped, undefined, undefined);
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
    if (isNaN(currentWidth) || currentWidth === undefined || currentWidth === null || !isFinite(currentWidth)) {
      return;
    }
    const numCurrent = Number(currentWidth);
    const newValue = numCurrent + STEP_SIZE;
    
    if (newValue - numCurrent !== STEP_SIZE) {
      return;
    }
    
    // Update state immediately for instant UI feedback
    const clamped = updateWidth(newValue);
    
    // Update lastNotifiedDimensionsRef immediately to prevent validation issues
    lastNotifiedDimensionsRef.current = {
      ...lastNotifiedDimensionsRef.current,
      width: clamped
    };
    
    if (clamped !== numCurrent && clamped >= WIDTH_MIN && clamped <= WIDTH_MAX) {
      notifyParent(undefined, clamped, undefined);
    }
  }, [notifyParent, updateWidth]);

  const handleWidthDecrement = useCallback(() => {
    const currentWidth = widthRef.current;
    if (isNaN(currentWidth) || currentWidth === undefined || currentWidth === null || !isFinite(currentWidth)) {
      return;
    }
    const numCurrent = Number(currentWidth);
    const newValue = numCurrent - STEP_SIZE;
    
    if (numCurrent - newValue !== STEP_SIZE) {
      return;
    }
    
    // Update state immediately for instant UI feedback
    const clamped = updateWidth(newValue);
    
    // Update lastNotifiedDimensionsRef immediately to prevent validation issues
    lastNotifiedDimensionsRef.current = {
      ...lastNotifiedDimensionsRef.current,
      width: clamped
    };
    
    if (clamped !== numCurrent && clamped >= WIDTH_MIN && clamped <= WIDTH_MAX) {
      notifyParent(undefined, clamped, undefined);
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
    if (isNaN(currentHeight) || currentHeight === undefined || currentHeight === null || !isFinite(currentHeight)) {
      return;
    }
    const numCurrent = Number(currentHeight);
    const newValue = numCurrent + STEP_SIZE;
    
    if (newValue - numCurrent !== STEP_SIZE) {
      return;
    }
    
    // Update state immediately for instant UI feedback
    const clamped = updateHeight(newValue);
    
    // Update lastNotifiedDimensionsRef immediately to prevent validation issues
    lastNotifiedDimensionsRef.current = {
      ...lastNotifiedDimensionsRef.current,
      height: clamped
    };
    
    if (clamped !== numCurrent && clamped >= HEIGHT_MIN && clamped <= HEIGHT_MAX) {
      notifyParent(undefined, undefined, clamped);
    }
  }, [notifyParent, updateHeight]);

  const handleHeightDecrement = useCallback(() => {
    const currentHeight = heightRef.current;
    if (isNaN(currentHeight) || currentHeight === undefined || currentHeight === null || !isFinite(currentHeight)) {
      return;
    }
    const numCurrent = Number(currentHeight);
    const newValue = numCurrent - STEP_SIZE;
    
    if (numCurrent - newValue !== STEP_SIZE) {
      return;
    }
    
    // Update state immediately for instant UI feedback
    const clamped = updateHeight(newValue);
    
    // Update lastNotifiedDimensionsRef immediately to prevent validation issues
    lastNotifiedDimensionsRef.current = {
      ...lastNotifiedDimensionsRef.current,
      height: clamped
    };
    
    if (clamped !== numCurrent && clamped >= HEIGHT_MIN && clamped <= HEIGHT_MAX) {
      notifyParent(undefined, undefined, clamped);
    }
  }, [notifyParent, updateHeight]);

  const handleHeightSliderChange = (values: number[]) => {
    handleHeightChange(values[0]);
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Adjust Dimensions</CardTitle>
        {isLocked && (
          <p className="text-xs text-muted-foreground mt-1">
            🔒 Dimensions are locked - unlock to edit
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Length Control - Show "Height" for Vertical Rods, "Length" for others */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{isVerticalRod ? 'Height (mm)' : 'Length (mm)'}</Label>
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
                disabled={isLocked || length <= LENGTH_MIN}
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
                disabled={isLocked || length >= LENGTH_MAX}
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
            disabled={isLocked}
          />
        </div>

        {/* Width Control - Hidden for rods */}
        {!isRodType && (
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
                  disabled={isLocked || width <= WIDTH_MIN}
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
                  disabled={isLocked || width >= WIDTH_MAX}
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
              disabled={isLocked}
            />
          </div>
        )}

        {/* Height Control - Hidden for rods */}
        {!isRodType && selectedComponent.dimensions.height !== undefined && (
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
                  disabled={isLocked || height <= HEIGHT_MIN}
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
                  disabled={isLocked || height >= HEIGHT_MAX}
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
              disabled={isLocked}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
