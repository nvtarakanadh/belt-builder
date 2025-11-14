import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { usePlacementStore } from "@/state/store";
import { validateSideGuideHeight, validateStopButtonCount, getStopButtonLimits } from "@/lib/params";
import { toast } from "sonner";
import { ConveyorModel, EngineType } from "@/lib/types";

export function PlacementConfigPanel() {
  const { params, updateParams, components } = usePlacementStore();

  const handleLChange = (value: string) => {
    const L = parseFloat(value) || 0;
    if (L > 0) {
      updateParams({ L });
    }
  };

  const handleNChange = (value: string) => {
    const N = parseFloat(value) || 0;
    if (N > 0) {
      updateParams({ N });
    }
  };

  const handleModelChange = (model: ConveyorModel) => {
    updateParams({ model });
  };

  const handleEngineTypeChange = (type: EngineType) => {
    updateParams({ engineType: type });
  };

  const handleSideGuideHeightChange = (value: string) => {
    const height = parseFloat(value) || 0;
    const validation = validateSideGuideHeight(height);
    
    if (!validation.valid && validation.error) {
      toast.error(validation.error);
      return;
    }

    updateParams({ sideGuideHeight: height });
  };

  const handleSideGuideToggle = (enabled: boolean) => {
    updateParams({ sideGuideEnabled: enabled });
  };

  const handleStopButtonSideChange = (side: "MOTOR" | "OPPOSITE" | "BOTH") => {
    updateParams({ stopButtonSide: side });
  };

  const handleStopButtonEndChange = (end: "START" | "END" | "BOTH") => {
    updateParams({ stopButtonEnd: end });
  };

  const handleStopButtonCountChange = (side: "motor" | "opposite", value: string) => {
    const count = parseInt(value) || 0;
    const limits = getStopButtonLimits(params.model);
    
    if (count < limits.min || count > limits.max) {
      toast.error(`Stop button count must be between ${limits.min} and ${limits.max} for ${params.model}`);
      return;
    }

    const newCounts = {
      ...params.stopButtonCount,
      [side]: count,
    };
    updateParams({ stopButtonCount: newCounts });
  };

  const handleSupportingFrameToggle = (enabled: boolean) => {
    updateParams({ supportingFrame: enabled });
  };

  const limits = getStopButtonLimits(params.model);
  const sideGuideValidation = params.sideGuideHeight
    ? validateSideGuideHeight(params.sideGuideHeight)
    : { valid: true };

  return (
    <Card className="p-4 space-y-6">
      <div>
        <h3 className="font-semibold text-lg mb-4">Conveyor Configuration</h3>

        {/* Model Selection */}
        <div className="space-y-2 mb-4">
          <Label>Conveyor Model</Label>
          <Select value={params.model} onValueChange={handleModelChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DPS50">DPS50</SelectItem>
              <SelectItem value="DPS60">DPS60</SelectItem>
              <SelectItem value="DPS96">DPS96</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dimensions */}
        <div className="space-y-4 mb-4">
          <div className="space-y-2">
            <Label>Axis to Axis Length (L) - mm</Label>
            <Input
              type="number"
              value={params.L}
              onChange={(e) => handleLChange(e.target.value)}
              placeholder="1000"
            />
          </div>

          <div className="space-y-2">
            <Label>Belt Width (N) - mm</Label>
            <Input
              type="number"
              value={params.N}
              onChange={(e) => handleNChange(e.target.value)}
              placeholder="500"
            />
          </div>

          <div className="space-y-2">
            <Label>Total Length (D) - mm</Label>
            <Input
              type="number"
              value={params.D.toFixed(2)}
              readOnly
              className="bg-secondary"
            />
            <p className="text-xs text-muted-foreground">
              Auto-calculated: L + {params.model === "DPS50" ? "55" : params.model === "DPS60" ? "70" : "100"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Conveyor Width (R) - mm</Label>
            <Input
              type="number"
              value={params.R.toFixed(2)}
              readOnly
              className="bg-secondary"
            />
            <p className="text-xs text-muted-foreground">Auto-calculated: N + 67</p>
          </div>
        </div>

        {/* Engine Type */}
        <div className="space-y-2 mb-4">
          <Label>Engine Type</Label>
          <RadioGroup
            value={params.engineType || ""}
            onValueChange={handleEngineTypeChange}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="NORMAL" id="engine-normal" />
              <Label htmlFor="engine-normal" className="cursor-pointer">Normal</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="REDACTOR" id="engine-redactor" />
              <Label htmlFor="engine-redactor" className="cursor-pointer">Redactor</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="CENTRAL" id="engine-central" />
              <Label htmlFor="engine-central" className="cursor-pointer">Central</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Side Guide */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <Label>Side Guide</Label>
            <input
              type="checkbox"
              checked={params.sideGuideEnabled || false}
              onChange={(e) => handleSideGuideToggle(e.target.checked)}
              className="h-4 w-4"
            />
          </div>
          {params.sideGuideEnabled && (
            <div className="space-y-2 ml-4">
              <Label>Height (15-250 mm)</Label>
              <Input
                type="number"
                value={params.sideGuideHeight || 100}
                onChange={(e) => handleSideGuideHeightChange(e.target.value)}
                min={15}
                max={250}
                className={!sideGuideValidation.valid ? "border-destructive" : ""}
              />
              {!sideGuideValidation.valid && (
                <p className="text-xs text-destructive">{sideGuideValidation.error}</p>
              )}
            </div>
          )}
        </div>

        {/* Stop Buttons */}
        <div className="space-y-2 mb-4">
          <Label>Stop Buttons</Label>
          <div className="space-y-2">
            <Label className="text-xs">Side</Label>
            <Select
              value={params.stopButtonSide || ""}
              onValueChange={handleStopButtonSideChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MOTOR">Motor Side</SelectItem>
                <SelectItem value="OPPOSITE">Opposite Side</SelectItem>
                <SelectItem value="BOTH">Both Sides</SelectItem>
              </SelectContent>
            </Select>

            {params.stopButtonSide && (
              <>
                <Label className="text-xs">End</Label>
                <Select
                  value={params.stopButtonEnd || ""}
                  onValueChange={handleStopButtonEndChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select end" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="START">Start</SelectItem>
                    <SelectItem value="END">End</SelectItem>
                    <SelectItem value="BOTH">Both Ends</SelectItem>
                  </SelectContent>
                </Select>

                {(params.stopButtonSide === "MOTOR" || params.stopButtonSide === "BOTH") && (
                  <div className="space-y-2">
                    <Label className="text-xs">Motor Side Count ({limits.min}-{limits.max})</Label>
                    <Input
                      type="number"
                      value={params.stopButtonCount?.motor || 0}
                      onChange={(e) => handleStopButtonCountChange("motor", e.target.value)}
                      min={limits.min}
                      max={limits.max}
                    />
                  </div>
                )}

                {(params.stopButtonSide === "OPPOSITE" || params.stopButtonSide === "BOTH") && (
                  <div className="space-y-2">
                    <Label className="text-xs">Opposite Side Count ({limits.min}-{limits.max})</Label>
                    <Input
                      type="number"
                      value={params.stopButtonCount?.opposite || 0}
                      onChange={(e) => handleStopButtonCountChange("opposite", e.target.value)}
                      min={limits.min}
                      max={limits.max}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Supporting Frame */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Supporting Frame</Label>
            <input
              type="checkbox"
              checked={params.supportingFrame || false}
              onChange={(e) => handleSupportingFrameToggle(e.target.checked)}
              className="h-4 w-4"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

