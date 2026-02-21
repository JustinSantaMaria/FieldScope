import { Link } from "wouter";
import { type Project } from "@shared/schema";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MapPin, Calendar, HardDrive, MoreVertical, Archive, RotateCcw, Trash2 } from "lucide-react";
import { format } from "date-fns";

interface ProjectCardProps {
  project: Project;
  onArchive?: (id: number) => void;
  onRestore?: (id: number) => void;
  onDelete?: (id: number) => void;
  showArchiveActions?: boolean;
}

export function ProjectCard({ project, onArchive, onRestore, onDelete, showArchiveActions = true }: ProjectCardProps) {
  const isArchived = project.status === 'archived';
  
  return (
    <Card 
      className="group hover:shadow-lg hover:border-primary/50 transition-all duration-300 overflow-hidden bg-card/50 backdrop-blur-sm border-border/60"
      data-testid={`card-project-${project.id}`}
    >
      <Link href={`/projects/${project.id}`} className="cursor-pointer">
        <CardHeader className="p-5 pb-2 space-y-2">
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs bg-muted/50 text-muted-foreground">
                {project.surveyId}
              </Badge>
              {isArchived && (
                <Badge variant="secondary" className="text-xs">
                  <Archive className="w-3 h-3 mr-1" />
                  Archived
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {project.cloudProvider && (
                <HardDrive className="w-4 h-4 text-primary/60" />
              )}
            </div>
          </div>
          <h3 className="font-display font-bold text-xl text-foreground group-hover:text-primary transition-colors">
            {project.siteName}
          </h3>
        </CardHeader>
        <CardContent className="p-5 pt-0 pb-4">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-xs mb-1">
            Client
          </p>
          <p className="text-foreground font-semibold">{project.clientName}</p>
          
          {project.address && (
            <div className="flex items-start gap-2 mt-4 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{project.address}</span>
            </div>
          )}
        </CardContent>
      </Link>
      <CardFooter className="p-4 bg-muted/20 border-t border-border/40 text-xs text-muted-foreground flex justify-between items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          <span>{project.createdAt ? format(new Date(project.createdAt), 'MMM d, yyyy') : 'Unknown date'}</span>
        </div>
        {showArchiveActions && (onArchive || onRestore || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-project-menu-${project.id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isArchived && onRestore && (
                <DropdownMenuItem 
                  onClick={() => onRestore(project.id)}
                  data-testid={`button-restore-project-${project.id}`}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restore
                </DropdownMenuItem>
              )}
              {!isArchived && onArchive && (
                <DropdownMenuItem 
                  onClick={() => onArchive(project.id)}
                  data-testid={`button-archive-project-${project.id}`}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => onDelete(project.id)}
                    className="text-destructive focus:text-destructive"
                    data-testid={`button-delete-project-${project.id}`}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardFooter>
    </Card>
  );
}
