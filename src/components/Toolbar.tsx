import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  MousePointer2, 
  Move, 
  RotateCw, 
  Box,
  Save,
  Download,
  Upload,
  Grid3x3,
  Eye,
  Undo2,
  Redo2,
  Building2,
  Focus,
  ZoomIn,
  ZoomOut,
  Hand,
  Eraser,
  Settings
} from "lucide-react";

interface ToolbarProps {
  onToolSelect: (tool: string) => void;
  activeTool: string;
  viewMode: 'focused' | 'shopfloor';
  onViewModeChange: (mode: 'focused' | 'shopfloor') => void;
  showGrid?: boolean;
  onToggleGrid?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSave?: () => void;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  // New view control callbacks
  onCenterView?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onPanMode?: () => void;
  onErase?: () => void;
  onSettings?: () => void;
  panModeActive?: boolean;
}

export const Toolbar = ({ 
  onToolSelect, 
  activeTool, 
  viewMode, 
  onViewModeChange, 
  showGrid = true, 
  onToggleGrid, 
  onUndo, 
  onRedo, 
  canUndo = false, 
  canRedo = false, 
  onSave, 
  saveStatus = 'idle',
  onCenterView,
  onZoomIn,
  onZoomOut,
  onPanMode,
  onErase,
  onSettings,
  panModeActive = false
}: ToolbarProps) => {
  return (
    <TooltipProvider>
      <div className="panel-glass px-4 py-3 flex items-center gap-2">
        <h1 className="text-xl font-bold text-gradient mr-4">UnoTEAM's Conveyor Designer</h1>
        
        <Separator orientation="vertical" className="h-8" />
        
        {/* View Controls Toolbar */}
        <div className="flex gap-1 bg-secondary/30 rounded-lg p-1 border border-border/50 shadow-sm">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeTool === 'center' ? 'default' : 'ghost'}
                size="icon"
                onClick={onCenterView}
                className="h-8 w-8"
              >
                <Focus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Center View</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onZoomIn}
                className="h-8 w-8"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom In</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onZoomOut}
                className="h-8 w-8"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Zoom Out</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={panModeActive ? 'default' : 'ghost'}
                size="icon"
                onClick={onPanMode}
                className="h-8 w-8"
                style={panModeActive ? { cursor: 'grabbing' } : {}}
              >
                <Hand className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Pan / Move</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onErase}
                className="h-8 w-8"
              >
                <Eraser className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Erase / Clear</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeTool === 'settings' ? 'default' : 'ghost'}
                size="icon"
                onClick={onSettings}
                className="h-8 w-8"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />
        
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeTool === 'select' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => onToolSelect('select')}
                className="transition-smooth"
              >
                <MousePointer2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Select (Q)</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeTool === 'move' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => onToolSelect('move')}
              >
                <Move className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Move (W)</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeTool === 'rotate' ? 'default' : 'ghost'}
                size="icon"
                onClick={() => onToolSelect('rotate')}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Rotate (E)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={onUndo}
                disabled={!canUndo}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Undo (Ctrl+Z)</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={onRedo}
                disabled={!canRedo}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Redo (Ctrl+Y)</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="h-8" />

        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={showGrid ? 'default' : 'ghost'} 
                size="icon"
                onClick={() => onToggleGrid?.()}
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle Grid</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon">
                <Eye className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle Visibility</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={viewMode === 'shopfloor' ? 'default' : 'ghost'} 
                size="icon"
                onClick={() => onViewModeChange(viewMode === 'focused' ? 'shopfloor' : 'focused')}
              >
                <Building2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle View Mode</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="ml-auto flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Import Project</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Export Project</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="default" 
                size="sm" 
                className="glow-primary"
                onClick={onSave}
                disabled={saveStatus === 'saving'}
              >
                <Save className="h-4 w-4 mr-2" />
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save Project'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Save Project (Auto-saves every 30s)</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
};
