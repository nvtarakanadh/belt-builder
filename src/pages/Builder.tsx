import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Toolbar } from '@/components/Toolbar';
import { ComponentLibrary } from '@/components/ComponentLibrary';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { BOMPanel } from '@/components/BOMPanel';
import { Scene, SceneControls } from '@/components/3d/Scene';
import { SettingsDialog } from '@/components/SettingsDialog';
import { SettingsPanel, SceneSettings, DEFAULT_SETTINGS as DEFAULT_SCENE_SETTINGS } from '@/components/3d/SettingsPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { ConveyorComponent, BOMItem } from '@/types/conveyor';
import { useAuth } from '@/hooks/useAuth';
import { usePlacementStore } from '@/state/store';
import { getOrFetchCsrfToken } from '@/lib/api';
import { API_BASE } from '@/lib/config';

type SceneComponent = {
  id: string;
  componentId: number;
  name: string;
  category: string;
  glb_url?: string | null;
  original_url?: string | null;
  bounding_box?: any;
  center?: any;
  position: [number, number, number];
  rotation?: [number, number, number];
  processing_status?: string;
  processing_error?: string;
  linkedTo?: string; // ID of the component this is linked/merged with
  isLocked?: boolean; // Whether this link is locked (merged)
  groupId?: string | null; // ID of the group this component belongs to
};

type ComponentGroup = {
  id: string;
  componentIds: string[];
};

const Builder = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const isReadonly = searchParams.get('readonly') === '1' || id === 'demo';
  const isDemo = id === 'demo';
  const [activeTool, setActiveTool] = useState('select');
  const [selectedComponent, setSelectedComponent] = useState<ConveyorComponent | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'focused' | 'shopfloor'>('focused');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [sceneComponents, setSceneComponents] = useState<SceneComponent[]>([]);
  const [groups, setGroups] = useState<ComponentGroup[]>([]);
  const groupsRef = useRef<ComponentGroup[]>([]);
  
  // Keep groupsRef in sync with groups state
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(
    id && id !== 'demo' ? parseInt(id, 10) : null
  );
  const hasLoadedRef = useRef(false); // Track if initial load has happened
  const isLoadingRef = useRef(false); // Prevent concurrent loads
  const loadedProjectIdRef = useRef<number | null>(null); // Track which project was loaded
  const isAddingComponentRef = useRef(false); // Prevent concurrent component additions
  const addedComponentIdsRef = useRef<Set<string>>(new Set()); // Track added component IDs
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveRef = useRef<number>(0);
  
  // History for undo/redo
  const [history, setHistory] = useState<SceneComponent[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false); // Prevent adding to history during undo/redo

  // Scene controls ref
  const sceneControlsRef = useRef<SceneControls | null>(null);
  
  // Settings dialog state
  const [showSettings, setShowSettings] = useState(false);
  const [panModeActive, setPanModeActive] = useState(false);
  
  // 3D Settings panel state
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [sceneSettings, setSceneSettings] = useState<SceneSettings>(DEFAULT_SCENE_SETTINGS);

  // Save to history whenever components change (except during undo/redo)
  const prevComponentsRef = useRef<string>('');
  const historyIndexRef = useRef(0);
  historyIndexRef.current = historyIndex;
  
  useEffect(() => {
    if (isUndoRedoRef.current || !hasLoadedRef.current) {
      return; // Skip during undo/redo or before initial load
    }
    
    // Don't save to history if components array is empty (might clear the scene)
    if (sceneComponents.length === 0) {
      console.log('⏭️ Skipping history save - components array is empty');
      return;
    }
    
    // Only save to history if components actually changed
    const currentState = JSON.stringify(sceneComponents.map(c => ({ id: c.id, position: c.position, rotation: c.rotation })));
    
    if (currentState !== prevComponentsRef.current) {
      console.log('📝 Saving to history. Current index:', historyIndexRef.current, 'Components:', sceneComponents.length);
      prevComponentsRef.current = currentState;
      // Remove any future history if we're not at the end
      setHistory(prev => {
        const newHistory = prev.slice(0, historyIndexRef.current + 1);
        newHistory.push([...sceneComponents]);
        const newIndex = newHistory.length - 1;
        console.log('📝 History updated. New index:', newIndex, 'History length:', newHistory.length);
        setHistoryIndex(newIndex);
        return newHistory;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneComponents]);

  // Load project assembly on mount or when ID changes
  useEffect(() => {
    // Reset load state if project ID changed or if we haven't loaded this project yet
    if (id && id !== 'demo') {
      const urlProjectId = parseInt(id, 10);
      if (!isNaN(urlProjectId)) {
        // If project ID changed, reset load state
        if (urlProjectId !== loadedProjectIdRef.current) {
          console.log('🔄 Project ID changed or not loaded yet, resetting load state', {
            urlProjectId,
            loadedProjectId: loadedProjectIdRef.current
          });
          hasLoadedRef.current = false;
          isLoadingRef.current = false;
          setCurrentProjectId(urlProjectId);
        }
      }
    }
    
    if (hasLoadedRef.current || isLoadingRef.current) {
      console.log('⏭️ Skipping load - already loaded or loading', {
        hasLoaded: hasLoadedRef.current,
        isLoading: isLoadingRef.current,
        currentProjectId,
        loadedProjectId: loadedProjectIdRef.current,
        urlId: id
      });
      return; // Already loaded or currently loading
    }
    
    const loadProject = async () => {
      console.log('🔄 Starting project load...');
      console.log('📍 URL project ID:', id);
      isLoadingRef.current = true;
      try {
        let project;
        
        // If we have a project ID from URL, load that specific project
        const urlProjectId = id && id !== 'demo' ? parseInt(id, 10) : null;
        if (urlProjectId && !isNaN(urlProjectId)) {
          console.log('Loading specific project from URL:', urlProjectId);
          const projectRes = await fetch(`${API_BASE}/api/projects/${urlProjectId}/`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          
          if (projectRes.ok) {
            project = await projectRes.json();
            console.log('✅ Loaded project from URL:', project.id, project.name);
            setCurrentProjectId(project.id);
          } else {
            console.error('Failed to load project from URL:', projectRes.status);
            // Fall through to try loading from list or create new
          }
        }
        
        // If no project loaded yet, try to get first project or create new one
        if (!project) {
          console.log('Loading projects list...');
          const projectRes = await fetch(`${API_BASE}/api/projects/`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          
          if (!projectRes.ok) {
            console.error('Failed to fetch projects:', projectRes.status, projectRes.statusText);
            return;
          }
          
          const projects = await projectRes.json();
          const results = Array.isArray(projects) ? projects : projects.results || [];
          console.log('Projects loaded:', results.length);
          
          if (results.length > 0) {
            project = results[0];
            console.log('Using first project:', project.id, project.name);
            setCurrentProjectId(project.id);
          }
        }
        
        if (project) {
          // Ensure currentProjectId is set
          if (!currentProjectId) {
            setCurrentProjectId(project.id);
          }
          
          // Load assembly items
          const itemsRes = await fetch(`${API_BASE}/api/assembly-items/?project_id=${project.id}`, {
            credentials: 'include',
          });
          
          if (!itemsRes.ok) {
            console.error('Failed to fetch assembly items:', itemsRes.status);
            return;
          }
          
          const itemsData = await itemsRes.json();
          const items = Array.isArray(itemsData) ? itemsData : itemsData.results || [];
          console.log('Assembly items loaded from backend:', items.length);
          
          // Step 1: Deduplicate by backend ID (most important - backend IDs must be unique)
          const uniqueItemsById = new Map<number, any>();
          for (const item of items) {
            const itemId = item.id;
            if (!itemId) {
              console.warn('⚠️ Item missing ID, skipping:', item);
              continue;
            }
            
            if (uniqueItemsById.has(itemId)) {
              console.warn(`⚠️ Duplicate backend ID detected: ${itemId}, keeping first occurrence`);
              continue;
            }
            
            uniqueItemsById.set(itemId, item);
          }
          
          console.log('Unique items by backend ID:', uniqueItemsById.size, 'out of', items.length);
          
          // Step 2: Additional deduplication by componentId + position (to catch same component at same position)
          const uniqueItems: any[] = [];
          const seenPositions = new Map<string, number>(); // componentId_position -> backend ID
          
          for (const [itemId, item] of uniqueItemsById.entries()) {
            const componentId = item.component?.id || item.component_id;
            if (!componentId) {
              console.warn(`⚠️ Item ${itemId} missing component ID, skipping`);
              continue;
            }
            
            // Round positions to 0.1mm precision for comparison
            const roundedX = Math.round((item.position_x || 0) * 10) / 10;
            const roundedY = Math.round((item.position_y || 0) * 10) / 10;
            const roundedZ = Math.round((item.position_z || 0) * 10) / 10;
            const posKey = `${componentId}_${roundedX}_${roundedY}_${roundedZ}`;
            
            // Check if we've seen this component at this position before
            if (seenPositions.has(posKey)) {
              const existingId = seenPositions.get(posKey);
              console.warn(`⚠️ Duplicate component at same position: componentId=${componentId}, position=[${roundedX}, ${roundedY}, ${roundedZ}]. Keeping ID ${existingId}, skipping ID ${itemId}`);
              continue;
            }
            
            seenPositions.set(posKey, itemId);
            uniqueItems.push(item);
          }
          
          console.log('Unique items after position deduplication:', uniqueItems.length);
          
          // Step 3: Map to SceneComponent format
          const loadedComponents: SceneComponent[] = uniqueItems.map((item: any) => {
            // Use saved bounding_box from metadata if available, otherwise use component's default
            // The metadata.bounding_box contains the actual saved dimensions
            let boundingBox = item.metadata?.bounding_box || item.component.bounding_box;
            
            // If we have scale values, reconstruct the bounding box from them
            // This ensures dimensions are preserved even if bounding_box wasn't saved correctly
            if (item.scale_x && item.scale_y && item.scale_z && (!boundingBox || !boundingBox.min || !boundingBox.max)) {
              const center = item.metadata?.center || item.component.center || [0, 0, 0];
              boundingBox = {
                min: [
                  center[0] - item.scale_x / 2,
                  center[1] - item.scale_y / 2,
                  center[2] - item.scale_z / 2,
                ],
                max: [
                  center[0] + item.scale_x / 2,
                  center[1] + item.scale_y / 2,
                  center[2] + item.scale_z / 2,
                ],
              };
            }
            
            return {
              id: `comp-${item.id}`,
              componentId: item.component.id,
              name: item.custom_name || item.component.name,
              category: item.component.category_label || item.component.category || '',
              glb_url: item.component.glb_url || item.component.glb_file_url,
              original_url: item.component.original_url || item.component.original_file_url,
              bounding_box: boundingBox,
              center: item.metadata?.center || item.component.center,
              position: [item.position_x || 0, item.position_y || 0, item.position_z || 0],
              rotation: [item.rotation_x || 0, item.rotation_y || 0, item.rotation_z || 0] as [number, number, number],
              processing_status: item.component.processing_status,
              processing_error: item.component.processing_error,
              groupId: item.metadata?.groupId || null,
            };
          });
          
          // Step 4: Final deduplication by frontend ID (shouldn't be needed, but safety check)
          const finalUniqueComponents: SceneComponent[] = [];
          const seenFrontendIds = new Set<string>();
          
          for (const comp of loadedComponents) {
            if (seenFrontendIds.has(comp.id)) {
              console.warn(`⚠️ Duplicate frontend ID in final check: ${comp.id} (${comp.name})`);
              continue;
            }
            seenFrontendIds.add(comp.id);
            finalUniqueComponents.push(comp);
          }
          
          console.log('Final loaded components (after deduplication):', finalUniqueComponents.length);
          console.log('Component IDs:', finalUniqueComponents.map(c => c.id));
          console.log('Component names:', finalUniqueComponents.map(c => c.name));
          
          // Reconstruct groups from loaded components
          const groupMap = new Map<string, string[]>(); // groupId -> componentIds
          finalUniqueComponents.forEach(comp => {
            if (comp.groupId) {
              if (!groupMap.has(comp.groupId)) {
                groupMap.set(comp.groupId, []);
              }
              groupMap.get(comp.groupId)!.push(comp.id);
            }
          });
          
          const reconstructedGroups: ComponentGroup[] = Array.from(groupMap.entries()).map(([groupId, componentIds]) => ({
            id: groupId,
            componentIds: componentIds,
            position: [0, 0, 0] as [number, number, number],
            rotation: [0, 0, 0] as [number, number, number],
            scale: [1, 1, 1] as [number, number, number],
          }));
          
          console.log('✅ Reconstructed groups:', reconstructedGroups.length, reconstructedGroups);
          
          // Always set components when loading (even if empty array)
          setSceneComponents(finalUniqueComponents);
          setGroups(reconstructedGroups);
          // Initialize history with loaded components
          setHistory([finalUniqueComponents]);
          setHistoryIndex(0);
          prevComponentsRef.current = JSON.stringify(finalUniqueComponents.map(c => ({ id: c.id, position: c.position, rotation: c.rotation })));
          // Track all loaded component IDs
          addedComponentIdsRef.current = new Set(finalUniqueComponents.map(c => c.id));
          hasLoadedRef.current = true;
          loadedProjectIdRef.current = project.id; // Track which project was loaded
          console.log('✅ Project loaded successfully');
          console.log('✅ Loaded components:', finalUniqueComponents.length);
          console.log('✅ Component IDs:', finalUniqueComponents.map(c => c.id));
          console.log('✅ Tracked component IDs:', Array.from(addedComponentIdsRef.current));
        } else {
          // Create default project
          console.log('No projects found, creating default project...');
          const createRes = await fetch(`${API_BASE}/api/projects/`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Default Project', description: 'Main assembly' }),
          });
          
          if (!createRes.ok) {
            console.error('Failed to create project:', createRes.status);
            isLoadingRef.current = false;
            hasLoadedRef.current = true; // Mark as loaded to prevent infinite retries
            return;
          }
          
          const newProject = await createRes.json();
          console.log('Created new project:', newProject.id);
          setCurrentProjectId(newProject.id);
          
          // Update URL if we created a new project and we're not in demo mode
          if (id !== 'demo' && id !== newProject.id.toString()) {
            navigate(`/builder/${newProject.id}`, { replace: true });
          }
          
          // Initialize with empty components for new project
          setSceneComponents([]);
          setHistory([[]]);
          setHistoryIndex(0);
          prevComponentsRef.current = JSON.stringify([]);
          addedComponentIdsRef.current = new Set();
          hasLoadedRef.current = true;
          loadedProjectIdRef.current = newProject.id; // Track which project was loaded
          console.log('✅ New project created and initialized');
        }
      } catch (error) {
        console.error('Failed to load project:', error);
      } finally {
        isLoadingRef.current = false;
      }
    };
    
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only depend on id to avoid infinite loops

  // Generate BOM from real components
  const bomItems: BOMItem[] = sceneComponents.map(comp => ({
    id: comp.id,
    partNumber: `COMP-${comp.componentId}`,
    description: comp.name,
      quantity: 1,
    material: comp.category || 'N/A',
    unitCost: 0,
    totalCost: 0
  }));

  // Find paired component for lock/unlock UI
  const findPairedComponent = useCallback((componentId: string): SceneComponent | null => {
    const component = sceneComponents.find(c => c.id === componentId);
    if (!component) {
      console.log('🔍 findPairedComponent: Component not found:', componentId);
      return null;
    }

    const compName = (component.name || '').toLowerCase();
    const compCategory = (component.category || '').toLowerCase();
    
    console.log('🔍 findPairedComponent: Looking for pair for', component.name, 'at', component.position);
    
    // Find components that are likely pairs (same type, opposite sides, etc.)
    const candidates = sceneComponents.filter(c => {
      if (c.id === componentId) return false;
      
      const cName = (c.name || '').toLowerCase();
      const cCategory = (c.category || '').toLowerCase();
      
      // Check if same component type (e.g., both are "Fixed Legs")
      const isSameType = compName === cName || 
                        (compName.includes('leg') && cName.includes('leg')) ||
                        (compName.includes('rod') && cName.includes('rod')) ||
                        (compName.includes('bed') && cName.includes('bed'));
      
      if (!isSameType) return false;
      
      // Calculate distance
      const dx = component.position[0] - c.position[0];
      const dy = component.position[1] - c.position[1];
      const dz = component.position[2] - c.position[2];
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      // Prefer components that are reasonably close (within 5 units) and on opposite sides
      // For legs, check if they're on opposite sides of a bed
      if (compName.includes('leg') || compName.includes('fixed')) {
        // Check if they're roughly aligned in one axis but separated in another
        const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
        const verticalDistance = Math.abs(dy);
        
        // Legs should be on opposite sides (large horizontal distance, small vertical)
        // More lenient: allow up to 20 units horizontal distance
        if (horizontalDistance > 0.5 && horizontalDistance < 20 && verticalDistance < 1.0) {
          console.log('🔍 Found leg candidate:', c.name, 'at', c.position, 'distance:', horizontalDistance);
          return true;
        }
      }
      
      // For other components, just check proximity - more lenient
      if (distance < 10 && distance > 0.1) {
        console.log('🔍 Found candidate:', c.name, 'at', c.position, 'distance:', distance);
        return true;
      }
      
      return false;
    });
    
    console.log('🔍 findPairedComponent: Found', candidates.length, 'candidates');
    
    if (candidates.length === 0) {
      // Fallback: find the nearest component of any type (within reasonable distance)
      console.log('🔍 findPairedComponent: No same-type candidates, looking for nearest component');
      const allCandidates = sceneComponents
        .filter(c => c.id !== componentId)
        .map(c => {
          const dx = component.position[0] - c.position[0];
          const dy = component.position[1] - c.position[1];
          const dz = component.position[2] - c.position[2];
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          return { component: c, distance };
        })
        .filter(item => item.distance < 15 && item.distance > 0.1)
        .sort((a, b) => a.distance - b.distance);
      
      if (allCandidates.length > 0) {
        console.log('🔍 findPairedComponent: Found nearest component:', allCandidates[0].component.name, 'at', allCandidates[0].component.position, 'distance:', allCandidates[0].distance);
        return allCandidates[0].component;
      }
      return null;
    }
    
    // Return the closest candidate
    const closest = candidates.reduce((closest, current) => {
      const dist1 = Math.sqrt(
        Math.pow(component.position[0] - closest.position[0], 2) +
        Math.pow(component.position[1] - closest.position[1], 2) +
        Math.pow(component.position[2] - closest.position[2], 2)
      );
      const dist2 = Math.sqrt(
        Math.pow(component.position[0] - current.position[0], 2) +
        Math.pow(component.position[1] - current.position[1], 2) +
        Math.pow(component.position[2] - current.position[2], 2)
      );
      return dist1 < dist2 ? closest : current;
    });
    
    console.log('🔍 findPairedComponent: Selected closest:', closest.name, 'at', closest.position);
    return closest;
  }, [sceneComponents]);

  const handleSelectComponent = (id: string) => {
    // Find component in scene
    const comp = sceneComponents.find(c => c.id === id);
    if (comp) {
      // If component is already selected, preserve existing dimensions
      // to avoid recalculating from bounding box which might be wrong
      const existingDimensions = selectedComponent?.id === comp.id ? selectedComponent.dimensions : undefined;
      
      // Calculate dimensions from bounding box if not preserving existing
      let dimensions = existingDimensions;
      
      // Check if this is a rod component
      const compName = (comp.name || '').toLowerCase();
      const compCategory = (comp.category || '').toLowerCase();
      const isRod = compName.includes('rod') || compCategory.includes('rod');
      const isVerticalRod = (compName.includes('vertical') && isRod) || (compCategory.includes('vertical') && isRod);
      const isHorizontalRod = (compName.includes('horizontal') && isRod) || (compCategory.includes('horizontal') && isRod);
      
      if (!dimensions && comp.bounding_box) {
        const width = Math.abs((comp.bounding_box.max?.[0] || 0) - (comp.bounding_box.min?.[0] || 0));
        const height = Math.abs((comp.bounding_box.max?.[1] || 0) - (comp.bounding_box.min?.[1] || 0));
        const length = Math.abs((comp.bounding_box.max?.[2] || 0) - (comp.bounding_box.min?.[2] || 0));
        
        // For rods, use small defaults for width/length to prevent incorrect values from bounding box
        if (isRod) {
          if (isVerticalRod) {
            // Vertical rod: height is the main dimension, width and length should be small
            dimensions = { 
              width: (width > 10 && width < 200) ? width : 50, 
              height: (height > 10) ? height : 1300, 
              length: (length > 10 && length < 200) ? length : 50 
            };
          } else {
            // Horizontal rod: length is the main dimension, width and height should be small
            dimensions = { 
              width: (width > 10 && width < 200) ? width : 50, 
              height: (height > 10 && height < 200) ? height : 50, 
              length: (length > 10) ? length : 1000 
            };
          }
        } else {
          // Only use calculated dimensions if they're reasonable (not too small)
          // This prevents using incorrect bounding boxes that might be from the component template
          if (width > 10 && height > 10 && length > 10) {
            dimensions = { width, height, length };
          } else {
            // Use reasonable defaults if bounding box seems wrong
            dimensions = { width: 450, height: 300, length: 350 };
          }
        }
      } else if (!dimensions) {
        // Use defaults based on component type
        if (isRod) {
          if (isVerticalRod) {
            dimensions = { width: 50, height: 1300, length: 50 };
          } else {
            dimensions = { width: 50, height: 50, length: 1000 };
          }
        } else {
          dimensions = { width: 450, height: 300, length: 350 };
        }
      }
      
      setSelectedComponent({
        id: comp.id,
        type: comp.category.toLowerCase() as any,
        name: comp.name,
        position: comp.position,
        rotation: comp.rotation || [0, 0, 0],
        dimensions: dimensions,
        material: 'default',
        specifications: {},
        cost: 0,
        partNumber: `COMP-${comp.componentId}`,
        processing_status: comp.processing_status,
        processing_error: comp.processing_error,
        glb_url: comp.glb_url,
        original_url: comp.original_url,
      });
    } else {
      // Component not found, clear selection
      setSelectedComponent(null);
    }
  };

  const handleAddComponent = async (component: Omit<SceneComponent, 'id'>) => {
    // Prevent concurrent additions
    if (isAddingComponentRef.current) {
      console.warn('⚠️ handleAddComponent already in progress, skipping duplicate call');
      return;
    }
    
    console.log('🚀 handleAddComponent called with:', component);
    console.log('🚀 Drop position:', component.position);
    console.log('🚀 currentProjectId:', currentProjectId);
    
    // Store the drop position and bounding_box to preserve them
    const dropPosition = component.position;
    const dropBoundingBox = component.bounding_box;
    const dropCenter = component.center;
    
    isAddingComponentRef.current = true;
    
    try {
      if (!currentProjectId) {
        console.error('❌ No project loaded, cannot add component');
        // Try to load/create project first
        console.log('Attempting to load or create project...');
        try {
          const projectsResponse = await fetch(`${API_BASE}/api/projects/`, {
            credentials: 'include',
          });
          if (projectsResponse.ok) {
            const projects = await projectsResponse.json();
            const results = Array.isArray(projects) ? projects : projects.results || [];
            if (results.length > 0) {
              const project = results[0];
              console.log('✅ Found existing project:', project.id);
              setCurrentProjectId(project.id);
              // Wait a bit for state to update, then retry
              // Use a small delay to ensure state is set
              // Clear the adding flag first
              isAddingComponentRef.current = false;
              setTimeout(() => {
                if (!isLoadingRef.current && !isAddingComponentRef.current) {
                  handleAddComponent(component);
                }
              }, 200);
              return;
            } else {
              // Create new project
              const newProjectResponse = await fetch(`${API_BASE}/api/projects/`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'New Project' }),
              });
              if (newProjectResponse.ok) {
                const newProject = await newProjectResponse.json();
                console.log('✅ Created new project:', newProject.id);
                setCurrentProjectId(newProject.id);
                // Wait a bit for state to update, then retry
                // Clear the adding flag first
                isAddingComponentRef.current = false;
                setTimeout(() => {
                  if (!isLoadingRef.current && !isAddingComponentRef.current) {
                    handleAddComponent(component);
                  }
                }, 200);
                return;
              }
            }
          }
        } catch (e) {
          console.error('Failed to load/create project:', e);
        } finally {
          isAddingComponentRef.current = false;
        }
        return;
      }

      // Save to backend first, then add to state with response data
      console.log('📤 Sending request to backend...');
      const requestBody = {
          component_id: component.componentId,
          custom_name: component.name,
          position_x: component.position[0],
          position_y: component.position[1],
          position_z: component.position[2],
          rotation_x: (component.rotation || [0, 0, 0])[0],
          rotation_y: (component.rotation || [0, 0, 0])[1],
          rotation_z: (component.rotation || [0, 0, 0])[2],
          rotation_w: 1.0,
      };
      console.log('📤 Request body:', requestBody);
      
      // Get CSRF token
      const csrfToken = await getOrFetchCsrfToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) {
        headers['X-CSRFToken'] = csrfToken;
      }
      
      const response = await fetch(`${API_BASE}/api/projects/${currentProjectId}/add_component/`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(requestBody),
      });

      console.log('📥 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ Failed to save component to backend:', errorData);
        return;
      }

      const assemblyItem = await response.json();
      console.log('✅ Backend response:', assemblyItem);
      console.log('✅ Backend response structure check:');
      console.log('  - assemblyItem.id:', assemblyItem.id);
      console.log('  - assemblyItem.component:', assemblyItem.component);
      console.log('  - assemblyItem.component.id:', assemblyItem.component?.id);
      console.log('  - assemblyItem.component.glb_url:', assemblyItem.component?.glb_url);
      console.log('  - assemblyItem.position_x:', assemblyItem.position_x);
      
      // Validate response structure
      if (!assemblyItem || !assemblyItem.id) {
        console.error('❌ Invalid backend response: missing id');
        return;
      }
      if (!assemblyItem.component || !assemblyItem.component.id) {
        console.error('❌ Invalid backend response: missing component data');
        return;
      }
      
      // For NEW components, ALWAYS use default dimensions based on component type
      // This ensures new components spawn with correct default dimensions
      // We ignore the backend's bounding_box for new components to ensure consistency
      const isConveyor = (assemblyItem.component.category_label || assemblyItem.component.category || '').toLowerCase().includes('belt') || 
                        (assemblyItem.component.category_label || assemblyItem.component.category || '').toLowerCase().includes('conveyor');
      
      let finalBoundingBox: { min: number[], max: number[] };
      
      // ALWAYS create default dimensions for new components
      if (isConveyor) {
        // Default conveyor dimensions: 1000mm length, 500mm width, 300mm height
        // For conveyors: X=width, Y=height, Z=length in world space
        // But in bounding_box: [0]=width, [1]=height, [2]=length
        const defaultLength = 1000;  // Total length (D)
        const defaultWidth = 500;    // Conveyor width (R)
        const defaultHeight = 300;   // Height
        
        finalBoundingBox = {
          min: [-defaultWidth / 2, 0, -defaultLength / 2],
          max: [defaultWidth / 2, defaultHeight, defaultLength / 2],
        };
      } else {
        // Default dimensions for other components
        const defaultSize = 450;
        finalBoundingBox = {
          min: [-defaultSize / 2, -defaultSize / 2, -defaultSize / 2],
          max: [defaultSize / 2, defaultSize / 2, defaultSize / 2],
        };
      }
      
      const newComponent: SceneComponent = {
        id: `comp-${assemblyItem.id}`,
        componentId: assemblyItem.component.id,
        name: assemblyItem.custom_name || assemblyItem.component.name || 'Unnamed Component',
        category: assemblyItem.component.category_label || assemblyItem.component.category || '',
        glb_url: assemblyItem.component.glb_url || null,
        original_url: assemblyItem.component.original_url || null,
        // Use the validated bounding_box
        bounding_box: finalBoundingBox,
        center: dropCenter || assemblyItem.component.center || [0, 0, 0],
        // Use the drop position (calculated via raycasting), not the backend position
        position: dropPosition as [number, number, number],
        rotation: [assemblyItem.rotation_x || 0, assemblyItem.rotation_y || 0, assemblyItem.rotation_z || 0] as [number, number, number],
        // Preserve linkedTo if it was passed (for auto-grouping)
        ...(component.linkedTo ? { linkedTo: component.linkedTo } : {}),
      };
      

      
      // Use functional update to ensure we have the latest state
      // Only add if component doesn't already exist
      setSceneComponents(prev => {
        // Check if we've already tracked this component ID
        if (addedComponentIdsRef.current.has(newComponent.id)) {
          return prev; // Don't add duplicate
        }
        
        // Check if component already exists by ID (most reliable check)
        const existingById = prev.find(c => c.id === newComponent.id);
        if (existingById) {
          addedComponentIdsRef.current.add(newComponent.id); // Track it
          return prev; // Don't add duplicate
        }
        
        // Also check for duplicates by backend ID (without comp- prefix)
        const backendId = String(assemblyItem.id);
        const existingByBackendId = prev.find(c => {
          const cBackendId = c.id.replace('comp-', '');
          return cBackendId === backendId;
        });
        if (existingByBackendId) {
          addedComponentIdsRef.current.add(newComponent.id); // Track it
          return prev; // Don't add duplicate
        }
        
        // Check for duplicates by componentId and very close position (within 1mm)
        const duplicateByPosition = prev.find(c => 
          c.componentId === newComponent.componentId &&
          Math.abs(c.position[0] - newComponent.position[0]) < 1 &&
          Math.abs(c.position[1] - newComponent.position[1]) < 1 &&
          Math.abs(c.position[2] - newComponent.position[2]) < 1
        );
        if (duplicateByPosition) {
          return prev; // Don't add duplicate
        }
        
        const updated = [...prev, newComponent];
        return updated;
      });
      
      // Don't reload all components - we already added the new one to state
      // This prevents duplicate components from being added
      
      // Track this component ID to prevent duplicates
      addedComponentIdsRef.current.add(newComponent.id);
      
      // Auto-group Fixed Legs with frames/beds if they were placed at an attach point
      const componentName = (newComponent.name || '').toLowerCase();
      const componentCategory = (newComponent.category || '').toLowerCase();
      const isFixedLeg = componentName.includes('fixed') && 
                        (componentName.includes('leg') || componentCategory.includes('leg'));
      
      if (isFixedLeg && (component as any).linkedTo) {
        // Find the frame/bed component that this leg should be grouped with
        const frameId = (component as any).linkedTo;
        // Wait for component to be added to state, then group
        setTimeout(() => {
          setSceneComponents(prev => {
            const frame = prev.find(c => c.id === frameId);
            const leg = prev.find(c => c.id === newComponent.id);
            if (frame && leg) {
              // Use handleLockComponents to group them
              handleLockComponents(newComponent.id, frameId);
              console.log('🔗 Auto-grouped Fixed Leg with frame:', {
                legId: newComponent.id,
                frameId: frameId,
                frameName: frame.name
              });
            }
            return prev;
          });
        }, 200);
      }
      
      // Small delay before allowing auto-save to prevent race conditions
      setTimeout(() => {
        isAddingComponentRef.current = false;
      }, 500);
    } catch (error) {
      console.error('❌ Failed to save component to backend:', error);
      // Reset flag on error too
      setTimeout(() => {
        isAddingComponentRef.current = false;
      }, 500);
    }
  };

  const handleUpdateComponent = async (id: string, update: Partial<SceneComponent>) => {
    // Use functional update to ensure we have the latest state
    setSceneComponents(prev => {
      const component = prev.find(c => c.id === id);
      if (!component) {
        console.warn('🔧 handleUpdateComponent: Component not found:', id);
        return prev;
      }
      
      console.log('🔧 handleUpdateComponent:', id, 'groupId:', component.groupId, 'update:', update);
      
      // If component is in a group and position/rotation is being updated, update all group members
      if (component.groupId && (update.position || update.rotation)) {
        // Use ref to get latest groups state
        const group = groupsRef.current.find(g => g.id === component.groupId);
        if (group) {
          console.log('🔧 Group found:', group.id, 'members:', group.componentIds);
          
          // Calculate the offset if position changed
          let positionOffset: [number, number, number] | null = null;
          if (update.position && component.position) {
            positionOffset = [
              update.position[0] - component.position[0],
              update.position[1] - component.position[1],
              update.position[2] - component.position[2],
            ];
            console.log('🔧 Position offset:', positionOffset);
          }
          
          // Calculate rotation offset if rotation changed
          let rotationOffset: [number, number, number] | null = null;
          if (update.rotation && component.rotation) {
            rotationOffset = [
              update.rotation[0] - (component.rotation[0] || 0),
              update.rotation[1] - (component.rotation[1] || 0),
              update.rotation[2] - (component.rotation[2] || 0),
            ];
            console.log('🔧 Rotation offset:', rotationOffset);
          }
          
          // Update all components in the group
          return prev.map(c => {
            if (c.id === id) {
              // Update the main component
              const updatedComp = { ...c, ...update };
              if (update.bounding_box) {
                updatedComp.bounding_box = {
                  min: [...(update.bounding_box.min || c.bounding_box?.min || [0, 0, 0])],
                  max: [...(update.bounding_box.max || c.bounding_box?.max || [0, 0, 0])]
                };
              }
              console.log('🔧 Updated main component:', c.name, 'new position:', updatedComp.position);
              return updatedComp;
            } else if (group.componentIds.includes(c.id)) {
              // Update other group members with the same offset
              const updatedComp = { ...c };
              if (positionOffset) {
                updatedComp.position = [
                  c.position[0] + positionOffset[0],
                  c.position[1] + positionOffset[1],
                  c.position[2] + positionOffset[2],
                ] as [number, number, number];
                console.log('🔧 Updated group member:', c.name, 'old position:', c.position, 'new position:', updatedComp.position);
              }
              if (rotationOffset) {
                updatedComp.rotation = [
                  (c.rotation?.[0] || 0) + rotationOffset[0],
                  (c.rotation?.[1] || 0) + rotationOffset[1],
                  (c.rotation?.[2] || 0) + rotationOffset[2],
                ] as [number, number, number];
                console.log('🔧 Updated group member rotation:', c.name, 'new rotation:', updatedComp.rotation);
              }
              return updatedComp;
            }
            return c;
          });
        } else {
          console.warn('🔧 Group not found for groupId:', component.groupId);
        }
      }
      
      // Single component update (not in group or non-position/rotation update)
      return prev.map(c => {
        if (c.id === id) {
          // Create a deep copy to ensure React detects nested object changes (like bounding_box)
          const updated = { ...c, ...update };
          // If bounding_box is being updated, ensure it's a new object reference
          if (update.bounding_box) {
            updated.bounding_box = {
              min: [...(update.bounding_box.min || c.bounding_box?.min || [0, 0, 0])],
              max: [...(update.bounding_box.max || c.bounding_box?.max || [0, 0, 0])]
            };
          }
          return updated;
        }
        return c;
      });
    });
    
    // Auto-save is now handled by the global auto-save system
    // No need to save individual updates here - the useEffect will trigger auto-save
  };

  // Undo/Redo handlers
  const handleUndo = useCallback(() => {
    console.log('↩️ Undo called. Current historyIndex:', historyIndex, 'History length:', history.length);
    if (historyIndex > 0) {
      isUndoRedoRef.current = true;
      const newIndex = historyIndex - 1;
      console.log('↩️ Undoing to index:', newIndex, 'Components:', history[newIndex]?.length);
      setHistoryIndex(newIndex);
      setSceneComponents([...history[newIndex]]);
      prevComponentsRef.current = JSON.stringify(history[newIndex].map(c => ({ id: c.id, position: c.position, rotation: c.rotation })));
      // Clear selection if deleted component was selected
      if (selectedComponent && !history[newIndex].find(c => c.id === selectedComponent.id)) {
        setSelectedComponent(null);
      }
      setTimeout(() => {
        isUndoRedoRef.current = false;
      }, 100);
    } else {
      console.warn('⚠️ Cannot undo: already at beginning of history');
    }
  }, [historyIndex, history, selectedComponent]);

  const handleRedo = useCallback(() => {
    console.log('↪️ Redo called. Current historyIndex:', historyIndex, 'History length:', history.length);
    if (historyIndex < history.length - 1) {
      isUndoRedoRef.current = true;
      const newIndex = historyIndex + 1;
      console.log('↪️ Redoing to index:', newIndex, 'Components:', history[newIndex]?.length);
      setHistoryIndex(newIndex);
      setSceneComponents([...history[newIndex]]);
      prevComponentsRef.current = JSON.stringify(history[newIndex].map(c => ({ id: c.id, position: c.position, rotation: c.rotation })));
      setTimeout(() => {
        isUndoRedoRef.current = false;
      }, 100);
    } else {
      console.warn('⚠️ Cannot redo: already at end of history');
    }
  }, [historyIndex, history]);

  const handleDeleteComponent = useCallback(async (id: string) => {
    if (!currentProjectId) {
      console.error('No project loaded, cannot delete component');
      return;
    }

    const component = sceneComponents.find(c => c.id === id);
    
    // If component is in a group, delete the entire group
    if (component?.groupId) {
      const group = groups.find(g => g.id === component.groupId);
      if (group) {
        // Delete all components in the group
        const groupComponentIds = group.componentIds;
        setSceneComponents(prev => prev.filter(c => !groupComponentIds.includes(c.id)));
        
        // Remove the group
        setGroups(prev => prev.filter(g => g.id !== component.groupId));
        
        // Clear selection if deleted component was selected
        if (selectedComponent && groupComponentIds.includes(selectedComponent.id)) {
          setSelectedComponent(null);
        }
        
        // Delete all group components from backend
        groupComponentIds.forEach(compId => {
          const comp = sceneComponents.find(c => c.id === compId);
          if (comp) {
            let componentId: string;
            if (compId.startsWith('comp-')) {
              componentId = compId.replace('comp-', '');
            } else {
              componentId = compId;
            }
            
            if (!componentId || isNaN(parseInt(componentId, 10))) {
              console.error('Invalid component ID format:', compId);
              return;
            }
            
            const url = `${API_BASE}/api/assembly-items/${componentId}/?project_id=${currentProjectId}`;
            fetch(url, {
              method: 'DELETE',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
            }).catch(error => {
              console.error(`Error deleting component ${componentId}:`, error);
            });
          }
        });
        
        return;
      }
    }

    // Remove from local state immediately (single component, not in group)
    setSceneComponents(prev => prev.filter(c => c.id !== id));
    
    // Clear selection if the deleted component was selected
    if (selectedComponent?.id === id) {
      setSelectedComponent(null);
    }

    // Delete from backend
    try {
      // Extract component ID - handle both 'comp-{id}' format and direct numeric ID
      let componentId: string;
      if (id.startsWith('comp-')) {
        componentId = id.replace('comp-', '');
      } else {
        componentId = id;
      }
      
      // Validate that we have a valid numeric ID
      if (!componentId || isNaN(parseInt(componentId, 10))) {
        console.error('Invalid component ID format:', id);
        return;
      }
      
      // Include project_id in query params for better filtering (optional but recommended)
      const baseUrl = `${API_BASE}/api/assembly-items/${componentId}/`;
      const url = currentProjectId ? `${baseUrl}?project_id=${currentProjectId}` : baseUrl;
      
      console.log('🗑️ Deleting component:', componentId, 'from project:', currentProjectId);
      
      const response = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to delete component from backend:', response.status, errorText);
        // Revert local state change if backend deletion failed
        // Note: We could reload from backend here, but for now we'll keep the optimistic update
      } else {
        console.log('✅ Successfully deleted component from backend');
      }
    } catch (error) {
      console.error('Error deleting component:', error);
      // Revert local state change on error
      // Note: We could reload from backend here to sync state
    }
  }, [currentProjectId, selectedComponent]);

  // Keyboard shortcuts for undo/redo and delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete selected component when Delete or Backspace is pressed
        if (selectedComponent && !isReadonly) {
          e.preventDefault();
          handleDeleteComponent(selectedComponent.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history, selectedComponent, isReadonly, handleDeleteComponent, handleUndo, handleRedo]);

  // Comprehensive save function that saves all component states
  const saveAssembly = async (showStatus = true) => {
    if (!currentProjectId) {
      console.error('❌ No project to save to');
      if (showStatus) {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
      return false;
    }
    
    if (showStatus) {
      setSaveStatus('saving');
    }
    
    try {
      // Deduplicate components before saving (by backend ID)
      const uniqueComponents = new Map<number, SceneComponent>();
      
      for (const c of sceneComponents) {
        const backendId = parseInt(c.id.replace('comp-', ''), 10);
        if (isNaN(backendId)) {
          console.warn('⚠️ Component has invalid ID format:', c.id);
          continue;
        }
        
        // If we already have this backend ID, skip it (keep first occurrence)
        if (uniqueComponents.has(backendId)) {
          console.warn(`⚠️ Duplicate backend ID detected: ${backendId} (${c.name}), skipping duplicate`);
          continue;
        }
        
        uniqueComponents.set(backendId, c);
      }
      
      // Map all unique components with their backend IDs
      const payload = {
        assembly_items: Array.from(uniqueComponents.entries()).map(([backendId, c]) => {
          // Calculate dimensions from bounding box if available
          let scale_x = 1, scale_y = 1, scale_z = 1;
          if (c.bounding_box) {
            const width = Math.abs((c.bounding_box.max?.[0] || 0) - (c.bounding_box.min?.[0] || 0));
            const height = Math.abs((c.bounding_box.max?.[1] || 0) - (c.bounding_box.min?.[1] || 0));
            const length = Math.abs((c.bounding_box.max?.[2] || 0) - (c.bounding_box.min?.[2] || 0));
            
            scale_x = width || 1;
            scale_y = height || 1;
            scale_z = length || 1;
          }
          
          return {
            id: backendId,
            position_x: c.position[0],
            position_y: c.position[1],
            position_z: c.position[2],
            rotation_x: (c.rotation || [0, 0, 0])[0],
            rotation_y: (c.rotation || [0, 0, 0])[1],
            rotation_z: (c.rotation || [0, 0, 0])[2],
            rotation_w: 1.0,
            scale_x: scale_x,
            scale_y: scale_y,
            scale_z: scale_z,
            metadata: {
              componentId: c.componentId,
              name: c.name,
              category: c.category,
              bounding_box: c.bounding_box,
              center: c.center,
              groupId: c.groupId || null,
            },
          };
        })
      };
      
      console.log('💾 Saving assembly:', {
        totalComponents: sceneComponents.length,
        uniqueComponents: payload.assembly_items.length,
        componentIds: payload.assembly_items.map(i => i.id)
      });
      
      // Get CSRF token
      const csrfToken = await getOrFetchCsrfToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) {
        headers['X-CSRFToken'] = csrfToken;
      }
      
      const response = await fetch(`${API_BASE}/api/projects/${currentProjectId}/save/`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ Save failed:', response.status, errorData);
        if (showStatus) {
          setSaveStatus('error');
          setTimeout(() => setSaveStatus('idle'), 3000);
        }
        return false;
      }
      
      const result = await response.json();
      console.log('✅ Assembly saved successfully:', {
        updated: result.updated || 0,
        deleted: result.deleted || 0,
        skipped: result.skipped || 0,
        errors: result.errors || []
      });
      
      // Log deleted items
      if (result.deleted > 0) {
        console.log(`🗑️ ${result.deleted} items were deleted from the backend`);
      }
      
      // If there were skipped items, log them
      if (result.skipped > 0) {
        console.warn(`⚠️ ${result.skipped} items were skipped during save`);
      }
      
      lastSaveRef.current = Date.now();
      if (showStatus) {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      }
      return true;
    } catch (e) {
      console.error('❌ Save failed with exception:', e);
      if (showStatus) {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
      return false;
    }
  };
  
  // Auto-save with debouncing
  const triggerAutoSave = useCallback(() => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Only auto-save if project is loaded and it's been at least 2 seconds since last save
    if (!currentProjectId || !hasLoadedRef.current) {
      return;
    }
    
    const timeSinceLastSave = Date.now() - lastSaveRef.current;
    if (timeSinceLastSave < 2000) {
      // Too soon after last save, wait a bit more
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveAssembly(false); // Silent auto-save
      }, 3000);
    } else {
      // Save immediately
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveAssembly(false); // Silent auto-save
      }, 2000); // 2 second debounce
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);
  
  // Auto-save when components change (debounced)
  useEffect(() => {
    if (!hasLoadedRef.current || isUndoRedoRef.current || isAddingComponentRef.current) {
      return; // Don't auto-save during initial load, undo/redo, or component addition
    }
    
    // Don't auto-save if components array is empty (might be a loading state)
    if (sceneComponents.length === 0) {
      console.log('⏭️ Skipping auto-save - components array is empty');
      return;
    }
    
    triggerAutoSave();
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [sceneComponents, triggerAutoSave]);
  
  // Periodic save every 30 seconds as backup
  useEffect(() => {
    if (!currentProjectId || !hasLoadedRef.current) {
      return;
    }
    
    const interval = setInterval(() => {
      if (sceneComponents.length > 0) {
        console.log('⏰ Periodic auto-save triggered');
        saveAssembly(false);
      }
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [currentProjectId, sceneComponents.length]);

  // View control handlers
  const handleCenterView = useCallback(() => {
    if (sceneControlsRef.current) {
      sceneControlsRef.current.resetCamera();
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    if (sceneControlsRef.current) {
      sceneControlsRef.current.zoomIn(1.2);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (sceneControlsRef.current) {
      sceneControlsRef.current.zoomOut(1.2);
    }
  }, []);

  const handlePanMode = useCallback(() => {
    if (panModeActive) {
      // Disable pan mode
      setPanModeActive(false);
      setActiveTool('select');
      if (sceneControlsRef.current) {
        sceneControlsRef.current.disablePanMode();
      }
    } else {
      // Enable pan mode
      setPanModeActive(true);
      setActiveTool('pan');
      if (sceneControlsRef.current) {
        sceneControlsRef.current.enablePanMode();
      }
    }
  }, [panModeActive]);

  const handleErase = useCallback(() => {
    if (sceneControlsRef.current) {
      sceneControlsRef.current.clearSelection();
      sceneControlsRef.current.clearHighlights();
    }
  }, []);

  const handleSettings = useCallback(() => {
    setShowSettingsPanel(!showSettingsPanel);
  }, [showSettingsPanel]);

  const handleClearAll = useCallback(async () => {
    if (!currentProjectId) {
      console.error('No project loaded, cannot clear components');
      return;
    }

    // Confirm with user
    if (!window.confirm('Are you sure you want to clear all components? This action cannot be undone.')) {
      return;
    }

    try {
      // Delete all components from backend
      const componentIds = sceneComponents.map(c => {
        const id = c.id.startsWith('comp-') ? c.id.replace('comp-', '') : c.id;
        return parseInt(id, 10);
      }).filter(id => !isNaN(id));

      console.log('🗑️ Clearing all components:', componentIds.length);

      // Delete each component from backend
      const deletePromises = componentIds.map(async (componentId) => {
        try {
          const url = `${API_BASE}/api/assembly-items/${componentId}/?project_id=${currentProjectId}`;
          const response = await fetch(url, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            console.error(`Failed to delete component ${componentId}:`, response.status);
          }
        } catch (error) {
          console.error(`Error deleting component ${componentId}:`, error);
        }
      });

      await Promise.all(deletePromises);

      // Clear local state
      setSceneComponents([]);
      setSelectedComponent(null);
      
      // Reset history
      setHistory([[]]);
      setHistoryIndex(0);
      prevComponentsRef.current = JSON.stringify([]);
      addedComponentIdsRef.current = new Set();

      console.log('✅ All components cleared');
    } catch (error) {
      console.error('Error clearing components:', error);
    }
  }, [currentProjectId, sceneComponents]);
  
  const handleSceneSettingsChange = useCallback((settings: SceneSettings) => {
    setSceneSettings(settings);
  }, []);
  
  const handleResetSceneSettings = useCallback(() => {
    setSceneSettings(DEFAULT_SCENE_SETTINGS);
  }, []);

  // Lock/unlock handlers - only prevent dimension changes, NOT grouping
  // Components merge automatically when placed together (handled separately)
  const handleLockComponents = useCallback((componentId1: string, componentId2: string) => {
    const comp1 = sceneComponents.find(c => c.id === componentId1);
    const comp2 = sceneComponents.find(c => c.id === componentId2);
    
    if (!comp1 || !comp2) return;
    
    // Only set isLocked flag to prevent dimension changes
    // Do NOT group components - grouping happens automatically when placed together
    setSceneComponents(prev => prev.map(c => 
      c.id === componentId1 || c.id === componentId2 
        ? { ...c, isLocked: true, linkedTo: c.id === componentId1 ? componentId2 : componentId1 }
        : c
    ));
    
    // Also update selectedComponent if it's one of the locked components
    if (selectedComponent && (selectedComponent.id === componentId1 || selectedComponent.id === componentId2)) {
      setSelectedComponent(prev => prev ? { ...prev, isLocked: true } : prev);
    }
    
    console.log('🔒 Components locked (dimensions):', componentId1, componentId2);
  }, [sceneComponents, selectedComponent]);

  const handleUnlockComponents = useCallback((componentId1: string, componentId2: string) => {
    const comp1 = sceneComponents.find(c => c.id === componentId1);
    const comp2 = sceneComponents.find(c => c.id === componentId2);
    
    if (!comp1 || !comp2) return;
    
    // Only clear isLocked flag to allow dimension changes again
    // Do NOT ungroup - grouping is separate from locking
    setSceneComponents(prev => prev.map(c => 
      c.id === componentId1 || c.id === componentId2 
        ? { ...c, isLocked: false, linkedTo: undefined }
        : c
    ));
    
    // Also update selectedComponent if it's one of the unlocked components
    if (selectedComponent && (selectedComponent.id === componentId1 || selectedComponent.id === componentId2)) {
      setSelectedComponent(prev => prev ? { ...prev, isLocked: false } : prev);
    }
    
    console.log('🔓 Components unlocked (dimensions):', componentId1, componentId2);
  }, [sceneComponents, selectedComponent]);

  // Update activeTool when pan mode changes
  useEffect(() => {
    if (!panModeActive && activeTool === 'pan') {
      setActiveTool('select');
    }
  }, [panModeActive, activeTool]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Readonly/Demo Banner */}
      {isReadonly && (
        <Alert className="m-4 mb-0 border-accent/50 bg-accent/10">
          <Lock className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              {isDemo ? 'Demo Mode' : 'Read-only Mode'}. Sign in to save your work.
            </span>
            {!isAuthenticated && (
              <Button
                size="sm"
                onClick={() => navigate('/login')}
                className="ml-4 bg-accent text-accent-foreground hover:bg-accent/90"
              >
                Sign In
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Top Toolbar */}
      <Toolbar 
        onToolSelect={setActiveTool}
        activeTool={activeTool} 
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid(!showGrid)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onSave={() => saveAssembly(true)}
        saveStatus={saveStatus}
        onCenterView={handleCenterView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onPanMode={handlePanMode}
        onErase={handleErase}
        onSettings={handleSettings}
        panModeActive={panModeActive}
        onClearAll={handleClearAll}
        isReadonly={isReadonly}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* Left Sidebar - Component Library */}
        <div className={`shrink-0 transition-all ${leftCollapsed ? 'w-12' : 'w-80'}`}>
          <ComponentLibrary 
            collapsed={leftCollapsed} 
            onToggleCollapse={() => setLeftCollapsed(!leftCollapsed)} 
          />
        </div>

        {/* Center - 3D Viewport */}
        <div className="flex-1 min-w-0 relative">
          {/* Debug overlay - remove after fixing */}
          <div className="absolute top-2 left-2 z-50 bg-black/70 text-white p-2 rounded text-xs">
            Components: {sceneComponents.length}
            {sceneComponents.length > 0 && (
              <div className="mt-1">
                {sceneComponents.map(c => <div key={c.id}>- {c.name}</div>)}
              </div>
            )}
          </div>
          <Scene 
            onSelectComponent={handleSelectComponent}
            viewMode={viewMode}
            showGrid={showGrid}
            components={sceneComponents}
            groups={groups}
            onAddComponent={handleAddComponent}
            onUpdateComponent={handleUpdateComponent}
            onLockComponents={handleLockComponents}
            onUnlockComponents={handleUnlockComponents}
            onFindPairedComponent={findPairedComponent}
            activeTool={activeTool}
            controlsRef={sceneControlsRef}
            sceneSettings={sceneSettings}
          />
        {/* Save button removed - now in Toolbar */}
        </div>

        {/* Right Sidebar - Properties & BOM */}
        <div className={`shrink-0 flex flex-col gap-4 transition-all ${rightCollapsed ? 'w-12' : 'w-96'}`}>
          <div className="flex-1 min-h-0 panel-glass flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
              <div className={rightCollapsed ? 'hidden' : ''}>
                <h2 className="font-semibold text-lg">Details</h2>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setRightCollapsed(!rightCollapsed)}
                className="shrink-0"
              >
                {rightCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
            <Tabs defaultValue="properties" className={`flex-1 flex flex-col min-h-0 ${rightCollapsed ? 'hidden' : ''}`}>
              <TabsList className="grid w-full grid-cols-2 bg-secondary mx-4 mt-2 flex-shrink-0">
                <TabsTrigger value="properties">Properties</TabsTrigger>
                <TabsTrigger value="bom">BOM</TabsTrigger>
              </TabsList>
              <TabsContent value="properties" className="flex-1 mt-4 overflow-y-auto custom-scrollbar min-h-0">
                <PropertiesPanel 
                  selectedComponent={selectedComponent}
                  onDeleteComponent={handleDeleteComponent}
                  onUpdateComponent={(component) => {
                    // Check if component is locked - if so, prevent dimension changes
                    const sceneComp = sceneComponents.find(c => c.id === component.id);
                    if (sceneComp?.isLocked) {
                      console.log('🔒 Component is locked, preventing dimension changes:', component.id);
                      // Still update other properties, but skip dimension updates
                      setSelectedComponent(component);
                      return;
                    }
                    
                    // Always update selectedComponent with the EXACT dimensions provided
                    // Do NOT recalculate from bounding box - use the values as-is
                    setSelectedComponent(component);
                    
                    // Also update the corresponding SceneComponent's bounding_box
                    // to reflect dimension changes in the 3D preview
                    // Ensure dimensions exist - if not, create from component
                    const hasDimensions = component.dimensions && (
                      component.dimensions.width !== undefined || 
                      component.dimensions.height !== undefined || 
                      component.dimensions.length !== undefined
                    );
                    
                    if (hasDimensions && component.id) {
                      const sceneComp = sceneComponents.find(c => c.id === component.id);
                      if (sceneComp) {
                        // Calculate center based on existing bounding box if present, else use current position
                        const oldMin = sceneComp.bounding_box?.min || [sceneComp.position[0] - 0.5, sceneComp.position[1] - 0.5, sceneComp.position[2] - 0.5];
                        const oldMax = sceneComp.bounding_box?.max || [sceneComp.position[0] + 0.5, sceneComp.position[1] + 0.5, sceneComp.position[2] + 0.5];
                        const oldCenter = [
                          (oldMin[0] + oldMax[0]) / 2,
                          (oldMin[1] + oldMax[1]) / 2,
                          (oldMin[2] + oldMax[2]) / 2,
                        ];
                        
                        // Check if this is a rod component
                        const componentName = (component.name || '').toLowerCase();
                        const componentCategory = (component.type || '').toLowerCase();
                        const isRod = componentName.includes('rod') || componentCategory.includes('rod');
                        const isVerticalRod = (componentName.includes('vertical') && isRod) || (componentCategory.includes('vertical') && isRod);
                        const isHorizontalRod = (componentName.includes('horizontal') && isRod) || (componentCategory.includes('horizontal') && isRod);
                        const isRodType = isVerticalRod || isHorizontalRod;
                        
                        // Use the EXACT provided dimension values - do NOT recalculate from bounding box
                        // This ensures we use the values from AdjustDimensions component
                        // IMPORTANT: Preserve existing dimensions if not provided (so changing one doesn't affect others)
                        const existingWidth = Math.abs(oldMax[0] - oldMin[0]);
                        const existingHeight = Math.abs(oldMax[1] - oldMin[1]);
                        const existingLength = Math.abs(oldMax[2] - oldMin[2]);
                        
                        let newWidth: number;
                        let newHeight: number;
                        let newLength: number;
                        
                        if (isRodType) {
                          // For rods, check the appropriate dimension based on type
                          // For vertical rods, check if we have a height value to update
                          if (isVerticalRod) {
                            // Vertical Rod: height dimension maps to height (Y axis)
                            // CRITICAL: For vertical rods, the slider value is stored in component.dimensions.height
                            // We MUST use this value to update the bounding box height
                            let rodHeight: number;
                            
                            // Check if height is provided in dimensions (this comes from the slider)
                            const providedHeight = component.dimensions?.height;
                            if (providedHeight !== undefined && providedHeight !== null && !isNaN(Number(providedHeight))) {
                              // Use the height value from dimensions (slider value) - this is the key!
                              rodHeight = Math.max(Number(providedHeight), 1); // Ensure at least 1mm
                            } else {
                              // Only fall back to existing if height is not provided at all
                              rodHeight = existingHeight > 0 ? existingHeight : 1300;
                            }
                            
                            // CRITICAL: For vertical rods, ALWAYS preserve width and length from component.dimensions
                            // Do NOT recalculate from bounding box as it might be incorrect
                            // If dimensions are not provided, use small defaults (typical rod dimensions)
                            let preservedWidth: number;
                            let preservedLength: number;
                            
                            // Always use component.dimensions.width if available (even if 0)
                            if (component.dimensions.width !== undefined && component.dimensions.width !== null) {
                              preservedWidth = Math.max(Number(component.dimensions.width), 1);
                            } else {
                              // If not in dimensions, check if we have a stored value, otherwise use default
                              preservedWidth = 50; // Default small width for rod
                            }
                            
                            // Always use component.dimensions.length if available (even if 0)
                            if (component.dimensions.length !== undefined && component.dimensions.length !== null) {
                              preservedLength = Math.max(Number(component.dimensions.length), 1);
                            } else {
                              // If not in dimensions, use default
                              preservedLength = 50; // Default small depth for rod
                            }
                            
                            newWidth = preservedWidth;
                            newHeight = rodHeight;
                            newLength = preservedLength;
                          } else if (isHorizontalRod && component.dimensions.length !== undefined && component.dimensions.length !== null && component.dimensions.length > 0) {
                            // Horizontal Rod: length dimension maps to length (Z axis)
                            const rodLength = Number(component.dimensions.length);
                            // Preserve width and height
                            const preservedWidth = component.dimensions.width !== undefined && component.dimensions.width > 0
                              ? Number(component.dimensions.width)
                              : (existingWidth > 0 ? existingWidth : 50);
                            const preservedHeight = component.dimensions.height !== undefined && component.dimensions.height > 0
                              ? Number(component.dimensions.height)
                              : (existingHeight > 0 ? existingHeight : 50);
                            
                            newWidth = preservedWidth;
                            newHeight = preservedHeight;
                            newLength = rodLength;
                          } else {
                            // No dimension provided, preserve existing
                            newWidth = existingWidth > 0 ? existingWidth : 50;
                            newHeight = existingHeight > 0 ? existingHeight : 50;
                            newLength = existingLength > 0 ? existingLength : 50;
                          }
                        } else {
                          // For non-rods or when length is not provided, use standard mapping
                          newWidth = (component.dimensions.width !== undefined && component.dimensions.width !== null && component.dimensions.width > 0)
                            ? Number(component.dimensions.width)
                            : (existingWidth > 0 ? existingWidth : 500); // Preserve existing or use default
                          newHeight = (component.dimensions.height !== undefined && component.dimensions.height !== null && component.dimensions.height > 0)
                            ? Number(component.dimensions.height)
                            : (existingHeight > 0 ? existingHeight : 300); // Preserve existing or use default
                          newLength = (component.dimensions.length !== undefined && component.dimensions.length !== null && component.dimensions.length > 0)
                            ? Number(component.dimensions.length)
                            : (existingLength > 0 ? existingLength : 1000); // Preserve existing or use default
                        }
                        
                        // Validate dimensions are reasonable (prevent huge jumps)
                        // But allow height up to 5000mm for tall vertical rods
                        if (newWidth > 1000 || newLength > 5000) {
                          return; // Reject suspicious values
                        }
                        // For vertical rods, allow height up to 5000mm; for others, max 2000mm
                        if (isVerticalRod && newHeight > 5000) {
                          return; // Reject suspicious values
                        }
                        if (!isVerticalRod && newHeight > 2000) {
                          return; // Reject suspicious values
                        }
                        
                        // Create new bounding box centered at the same position
                        // Ensure dimensions are valid (at least 1mm)
                        const validWidth = Math.max(newWidth, 1);
                        const validHeight = Math.max(newHeight, 1);
                        const validLength = Math.max(newLength, 1);
                        
                        // For vertical rods, preserve the bottom Y position when height changes
                        // This prevents the rod from jumping when length is adjusted
                        let newCenterY = oldCenter[1];
                        if (isVerticalRod) {
                          // For vertical rods, keep the bottom at the same position
                          // oldBottom = oldCenter[1] - oldHeight/2
                          // newCenter[1] = oldBottom + newHeight/2
                          const oldHeight = Math.abs(oldMax[1] - oldMin[1]);
                          const oldBottom = oldCenter[1] - (oldHeight / 2);
                          newCenterY = oldBottom + (validHeight / 2);
                        }
                        
                        // Bounding box values are in mm, but we need to ensure they're properly formatted
                        // The Scene component will convert mm to grid units (1 grid unit = 100mm)
                        const newBoundingBox = {
                          min: [
                            oldCenter[0] - validWidth / 2,
                            newCenterY - validHeight / 2,
                            oldCenter[2] - validLength / 2,
                          ],
                          max: [
                            oldCenter[0] + validWidth / 2,
                            newCenterY + validHeight / 2,
                            oldCenter[2] + validLength / 2,
                          ],
                        };
                        
                        // For vertical rods, we may need to adjust the component position to keep bottom fixed
                        // But only if the rod is not locked to a wheel (locked rods have fixed Y position)
                        let positionUpdate: Partial<SceneComponent> | undefined = undefined;
                        if (isVerticalRod && sceneComp.linkedTo) {
                          // Vertical rod is locked - position is managed by the lock system
                          // Don't update position
                        } else if (isVerticalRod) {
                          // For unlocked vertical rods, adjust Y position to keep bottom fixed
                          const oldHeight = Math.abs(oldMax[1] - oldMin[1]);
                          const oldBottom = oldCenter[1] - (oldHeight / 2);
                          const newBottom = newCenterY - (validHeight / 2);
                          const yOffset = newBottom - oldBottom;
                          
                          if (Math.abs(yOffset) > 0.001) {
                            positionUpdate = {
                              position: [
                                sceneComp.position[0],
                                sceneComp.position[1] + (yOffset / 100), // Convert mm to grid units
                                sceneComp.position[2]
                              ] as [number, number, number]
                            };
                          }
                        }
                        
                        // Also update the component's dimensions in the scene component for future reference
                        // This ensures width/length are preserved for rods
                        const dimensionUpdate: any = {
                          bounding_box: newBoundingBox,
                          ...positionUpdate
                        };
                        
                        // Store dimensions on the scene component for rods to preserve them
                        // This is critical to prevent width/length from being recalculated incorrectly
                        if (isRodType) {
                          dimensionUpdate.dimensions = {
                            width: validWidth,
                            height: validHeight,
                            length: validLength
                          };
                        }
                        
                        handleUpdateComponent(component.id, dimensionUpdate);
                      }
                    }
                  }}
                />
              </TabsContent>
              <TabsContent value="bom" className="flex-1 mt-4 overflow-hidden min-h-0">
                <BOMPanel items={bomItems} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        showGrid={showGrid}
        onToggleGrid={(enabled) => setShowGrid(enabled)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
      
      {/* 3D Settings Panel */}
      <SettingsPanel
        open={showSettingsPanel}
        settings={sceneSettings}
        onSettingsChange={handleSceneSettingsChange}
        onResetSettings={handleResetSceneSettings}
      />
    </div>
  );
};

export default Builder;
