import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { MoreVertical, Edit2, Copy, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Project, useProjectActions } from "@/hooks/useProjectActions";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface ProjectCardProps {
  project: Project;
  onOpen?: (project: Project) => void;
}

export const ProjectCard = ({ project, onOpen }: ProjectCardProps) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { duplicateProject, deleteProject, renameProject } = useProjectActions();

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRename = () => {
    setIsRenaming(true);
  };

  const handleRenameSubmit = () => {
    if (name.trim() && name !== project.name) {
      renameProject.mutate({ projectId: project.id, name: name.trim() });
    } else {
      setName(project.name);
    }
    setIsRenaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setName(project.name);
      setIsRenaming(false);
    }
  };

  const handleDuplicate = () => {
    duplicateProject.mutate(project.id);
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    deleteProject.mutate(project.id);
  };

  const handleOpen = () => {
    if (onOpen) {
      onOpen(project);
    } else {
      navigate(`/builder/${project.id}`);
    }
  };

  const lastEdited = formatDistanceToNow(new Date(project.updated_at), { addSuffix: true });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -4 }}
      className="group relative rounded-2xl bg-card border border-border overflow-hidden shadow-soft hover:shadow-soft-lg transition-all"
    >
      {/* Thumbnail */}
      <div
        className="aspect-video bg-muted/20 relative cursor-pointer"
        onClick={handleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && handleOpen()}
        aria-label={`Open project ${project.name}`}
      >
        {project.thumbnail_url ? (
          <img
            src={project.thumbnail_url}
            alt={project.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-4xl font-bold text-muted-foreground/30">
              {project.name.charAt(0).toUpperCase()}
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      </div>

      {/* Content */}
      <div className="p-6 space-y-4">
        {/* Title with inline rename */}
        {isRenaming ? (
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleKeyDown}
            className="font-bold text-lg"
          />
        ) : (
          <h3
            className="font-bold text-lg cursor-pointer hover:text-accent transition-colors"
            onClick={handleOpen}
            onKeyDown={(e) => e.key === "Enter" && handleOpen()}
            tabIndex={0}
            role="button"
          >
            {project.name}
          </h3>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Edited {lastEdited}</span>
          {project.item_count !== undefined && (
            <Badge variant="outline">{project.item_count} items</Badge>
          )}
        </div>

        {/* Chips */}
        {project.metadata && typeof project.metadata === 'object' && (
          <div className="flex flex-wrap gap-2">
            {project.metadata.length && (
              <Badge variant="secondary" className="text-xs">
                Length: {project.metadata.length}m
              </Badge>
            )}
            {project.metadata.width && (
              <Badge variant="secondary" className="text-xs">
                Width: {project.metadata.width}mm
              </Badge>
            )}
            {project.metadata.motor && (
              <Badge variant="secondary" className="text-xs">
                Motor: {project.metadata.motor}
              </Badge>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpen}
            className="flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Open
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleRename}>
                <Edit2 className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Project"
        description={`Are you sure you want to delete "${project.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        variant="destructive"
      />
    </motion.div>
  );
};

