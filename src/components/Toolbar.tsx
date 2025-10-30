import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  Building2
} from "lucide-react";

interface ToolbarProps {
  onToolSelect: (tool: string) => void;
  activeTool: string;
  viewMode: 'focused' | 'shopfloor';
  onViewModeChange: (mode: 'focused' | 'shopfloor') => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleGrid?: () => void;
  onTogglePreview?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  onSave?: () => void;
  gridEnabled?: boolean;
  previewEnabled?: boolean;
}

export const Toolbar = ({ onToolSelect, activeTool, viewMode, onViewModeChange, onUndo, onRedo, onToggleGrid, onTogglePreview, onImport, onExport, onSave, gridEnabled, previewEnabled }: ToolbarProps) => {
  return (
    <div className="panel-glass px-4 py-3 flex items-center gap-2">
      <h1 className="text-xl font-bold text-gradient mr-4">UnoTEAM's Conveyor Designer</h1>
      
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
          <TooltipContent>Select</TooltipContent>
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
          <TooltipContent>Move</TooltipContent>
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
          <TooltipContent>Rotate</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-8" />

      <div className="flex gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onUndo}>
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onRedo}>
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-8" />

      <div className="flex gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={gridEnabled ? 'default' : 'ghost'} size="icon" onClick={onToggleGrid}>
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle Grid</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={previewEnabled ? 'default' : 'ghost'} size="icon" onClick={onTogglePreview}>
              <Eye className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Preview Mode</TooltipContent>
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
          <TooltipContent>Toggle Shopfloor</TooltipContent>
        </Tooltip>
      </div>

      <div className="ml-auto flex gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onImport}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import a model</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export project</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="default" size="sm" className="glow-primary" onClick={onSave}>
              <Save className="h-4 w-4 mr-2" />
              Save Project
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save project</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
