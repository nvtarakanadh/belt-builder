import { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Moon, Sun } from 'lucide-react';

export interface SceneSettings {
  viewMode: 'realistic' | 'orthographic' | 'wireframe';
  levelOfDetail: 'high' | 'medium' | 'low';
  zoomTarget: 'center' | 'selection';
  invertZoom: boolean;
  shadows: boolean;
  placementPreview: boolean;
  coordinateSystem: boolean;
  cameraCube: boolean;
  grid: boolean;
  fpsCounter: boolean;
}

export const DEFAULT_SETTINGS: SceneSettings = {
  viewMode: 'realistic',
  levelOfDetail: 'high',
  zoomTarget: 'center',
  invertZoom: false,
  shadows: true,
  placementPreview: true,
  coordinateSystem: false,
  cameraCube: true, // Camera cube visible by default
  grid: true,
  fpsCounter: false,
};

interface SettingsPanelProps {
  open: boolean;
  onClose?: () => void;
  settings: SceneSettings;
  onSettingsChange: (settings: SceneSettings) => void;
  onResetSettings?: () => void;
}

// FPS Counter component (will be rendered in Scene, not here)

export function SettingsPanel({
  open,
  onClose,
  settings,
  onSettingsChange,
  onResetSettings,
}: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState<SceneSettings>(settings);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Sync local settings with props
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Handle theme mounting to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const updateSetting = useCallback((key: keyof SceneSettings, value: any) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  }, [localSettings, onSettingsChange]);

  const handleReset = useCallback(() => {
    setLocalSettings(DEFAULT_SETTINGS);
    onSettingsChange(DEFAULT_SETTINGS);
    onResetSettings?.();
  }, [onSettingsChange, onResetSettings]);


  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-background border-l border-border shadow-xl z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">3D Settings</h2>
        <p className="text-sm text-muted-foreground">Viewport configuration</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* View Mode */}
        <div className="space-y-2">
          <Label htmlFor="view-mode">View</Label>
          <Select
            value={localSettings.viewMode}
            onValueChange={(value: 'realistic' | 'orthographic' | 'wireframe') =>
              updateSetting('viewMode', value)
            }
          >
            <SelectTrigger id="view-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="realistic">Realistic</SelectItem>
              <SelectItem value="orthographic">Orthographic</SelectItem>
              <SelectItem value="wireframe">Wireframe</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Level of Detail */}
        <div className="space-y-2">
          <Label htmlFor="lod">Level of detail</Label>
          <Select
            value={localSettings.levelOfDetail}
            onValueChange={(value: 'high' | 'medium' | 'low') =>
              updateSetting('levelOfDetail', value)
            }
          >
            <SelectTrigger id="lod">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Zoom Target */}
        <div className="space-y-2">
          <Label htmlFor="zoom-target">Zoom target</Label>
          <Select
            value={localSettings.zoomTarget}
            onValueChange={(value: 'center' | 'selection') =>
              updateSetting('zoomTarget', value)
            }
          >
            <SelectTrigger id="zoom-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="center">Center of screen</SelectItem>
              <SelectItem value="selection">Selection</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Invert Zoom */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="invert-zoom">Invert Zoom</Label>
            <p className="text-xs text-muted-foreground">Reverse zoom direction</p>
          </div>
          <Switch
            id="invert-zoom"
            checked={localSettings.invertZoom}
            onCheckedChange={(checked) => updateSetting('invertZoom', checked)}
          />
        </div>

        <Separator />

        {/* Display Options */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Display</h3>
          
          {/* Theme Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="theme" className="cursor-pointer">Theme</Label>
              <p className="text-xs text-muted-foreground">Switch between light and dark mode</p>
            </div>
            <Button
              id="theme"
              variant="outline"
              size="sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-10 h-10 p-0"
            >
              {mounted && theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="shadows" className="cursor-pointer">Shadow</Label>
              <p className="text-xs text-muted-foreground">Enable shadow rendering</p>
            </div>
            <Switch
              id="shadows"
              checked={localSettings.shadows}
              onCheckedChange={(checked) => updateSetting('shadows', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="grid" className="cursor-pointer">Grid</Label>
              <p className="text-xs text-muted-foreground">Show grid floor</p>
            </div>
            <Switch
              id="grid"
              checked={localSettings.grid}
              onCheckedChange={(checked) => updateSetting('grid', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="coordinate-system" className="cursor-pointer">Coordinate system</Label>
              <p className="text-xs text-muted-foreground">Show XYZ axes helper</p>
            </div>
            <Switch
              id="coordinate-system"
              checked={localSettings.coordinateSystem}
              onCheckedChange={(checked) => updateSetting('coordinateSystem', checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="fps-counter" className="cursor-pointer">FPS counter</Label>
              <p className="text-xs text-muted-foreground">Show performance counter</p>
            </div>
            <Switch
              id="fps-counter"
              checked={localSettings.fpsCounter}
              onCheckedChange={(checked) => updateSetting('fpsCounter', checked)}
            />
          </div>
        </div>

        <Separator />

        {/* Interaction Options */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Interaction</h3>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="placement-preview" className="cursor-pointer">Placement preview</Label>
              <p className="text-xs text-muted-foreground">Show preview when placing components</p>
            </div>
            <Switch
              id="placement-preview"
              checked={localSettings.placementPreview}
              onCheckedChange={(checked) => updateSetting('placementPreview', checked)}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Button
          variant="outline"
          className="w-full"
          onClick={handleReset}
        >
          Reset to Factory Settings
        </Button>
      </div>
    </div>
  );
}

