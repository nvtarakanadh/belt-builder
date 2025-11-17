import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showGrid?: boolean;
  onToggleGrid?: (enabled: boolean) => void;
  viewMode?: 'focused' | 'shopfloor';
  onViewModeChange?: (mode: 'focused' | 'shopfloor') => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  showGrid = true,
  onToggleGrid,
  viewMode = 'focused',
  onViewModeChange,
}: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize your view and display options
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Display Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Display</h3>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="grid-toggle">Show Grid</Label>
                <p className="text-sm text-muted-foreground">
                  Toggle the grid floor visibility
                </p>
              </div>
              <Switch
                id="grid-toggle"
                checked={showGrid}
                onCheckedChange={onToggleGrid}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>View Mode</Label>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'focused' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onViewModeChange?.('focused')}
                  className="flex-1"
                >
                  Focused
                </Button>
                <Button
                  variant={viewMode === 'shopfloor' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onViewModeChange?.('shopfloor')}
                  className="flex-1"
                >
                  Shop Floor
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {viewMode === 'focused' 
                  ? 'Close-up view for detailed work' 
                  : 'Wide view for overall layout'}
              </p>
            </div>
          </div>

          <Separator />

          {/* Camera Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Camera</h3>
            <div className="space-y-2">
              <Label htmlFor="camera-speed">Camera Speed</Label>
              <Input
                id="camera-speed"
                type="number"
                defaultValue={1}
                min={0.1}
                max={5}
                step={0.1}
                className="w-full"
              />
              <p className="text-sm text-muted-foreground">
                Adjust camera movement sensitivity
              </p>
            </div>
          </div>

          <Separator />

          {/* Performance Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Performance</h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="shadows">Shadows</Label>
                <p className="text-sm text-muted-foreground">
                  Enable shadow rendering
                </p>
              </div>
              <Switch
                id="shadows"
                defaultChecked={true}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

