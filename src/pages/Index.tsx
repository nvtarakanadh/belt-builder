import { useState, useEffect, useRef, useCallback } from 'react';
import { Toolbar } from '@/components/Toolbar';
import { ComponentLibrary } from '@/components/ComponentLibrary';
import { PropertiesPanel } from '@/components/PropertiesPanel';
import { BOMPanel } from '@/components/BOMPanel';
import { Scene } from '@/components/3d/Scene';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ConveyorComponent, BOMItem } from '@/types/conveyor';

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
};

const Index = () => {
  const [activeTool, setActiveTool] = useState('select');
  const [selectedComponent, setSelectedComponent] = useState<ConveyorComponent | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<'focused' | 'shopfloor'>('focused');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [sceneComponents, setSceneComponents] = useState<SceneComponent[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const hasLoadedRef = useRef(false); // Track if initial load has happened
  const isLoadingRef = useRef(false); // Prevent concurrent loads
  const isAddingComponentRef = useRef(false); // Prevent concurrent component additions
  const addedComponentIdsRef = useRef<Set<string>>(new Set()); // Track added component IDs
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveRef = useRef<number>(0);
  
  // History for undo/redo
  const [history, setHistory] = useState<SceneComponent[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false); // Prevent adding to history during undo/redo

  const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000";

  // Save to history whenever components change (except during undo/redo)
  const prevComponentsRef = useRef<string>('');
  const historyIndexRef = useRef(0);
  historyIndexRef.current = historyIndex;
  
  useEffect(() => {
    if (isUndoRedoRef.current || !hasLoadedRef.current) {
      return; // Skip during undo/redo or before initial load
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

  // Load project assembly on mount (only once)
  useEffect(() => {
    if (hasLoadedRef.current || isLoadingRef.current) {
      console.log('⏭️ Skipping load - already loaded or loading');
      return; // Already loaded or currently loading
    }
    
    const loadProject = async () => {
      console.log('🔄 Starting project load...');
      isLoadingRef.current = true;
      try {
        console.log('Loading project...');
        // Create or get default project
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
          const project = results[0];
          console.log('Using project:', project.id, project.name);
          setCurrentProjectId(project.id);
          
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
          const loadedComponents: SceneComponent[] = uniqueItems.map((item: any) => ({
            id: `comp-${item.id}`,
            componentId: item.component.id,
            name: item.custom_name || item.component.name,
            category: item.component.category_label || item.component.category || '',
            glb_url: item.component.glb_url || item.component.glb_file_url,
            original_url: item.component.original_url || item.component.original_file_url,
            bounding_box: item.component.bounding_box,
            center: item.component.center,
            position: [item.position_x || 0, item.position_y || 0, item.position_z || 0],
            rotation: [item.rotation_x || 0, item.rotation_y || 0, item.rotation_z || 0] as [number, number, number],
          }));
          
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
          
          // Only set components if we haven't loaded yet
          if (!hasLoadedRef.current) {
            setSceneComponents(finalUniqueComponents);
            // Initialize history with loaded components
            setHistory([finalUniqueComponents]);
            setHistoryIndex(0);
            prevComponentsRef.current = JSON.stringify(finalUniqueComponents.map(c => ({ id: c.id, position: c.position, rotation: c.rotation })));
            // Track all loaded component IDs
            addedComponentIdsRef.current = new Set(finalUniqueComponents.map(c => c.id));
            hasLoadedRef.current = true;
            console.log('✅ Project loaded successfully');
            console.log('✅ Tracked component IDs:', Array.from(addedComponentIdsRef.current));
          } else {
            console.warn('⚠️ Attempted to load components but already loaded - skipping');
          }
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
            return;
          }
          
          const newProject = await createRes.json();
          console.log('Created new project:', newProject.id);
          setCurrentProjectId(newProject.id);
          hasLoadedRef.current = true;
        }
      } catch (error) {
        console.error('Failed to load project:', error);
      } finally {
        isLoadingRef.current = false;
      }
    };
    
    loadProject();
  }, []);

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

  const handleSelectComponent = (id: string) => {
    // Find component in scene
    const comp = sceneComponents.find(c => c.id === id);
    if (comp) {
      // If component is already selected and we're just updating, preserve existing dimensions
      // to avoid recalculating from bounding box which might be wrong
      const existingDimensions = selectedComponent?.id === comp.id ? selectedComponent.dimensions : undefined;
      
      setSelectedComponent({
        id: comp.id,
        type: comp.category.toLowerCase() as any,
        name: comp.name,
        position: comp.position,
        rotation: comp.rotation || [0, 0, 0],
        dimensions: existingDimensions || (comp.bounding_box ? {
          width: Math.abs((comp.bounding_box.max?.[0] || 0) - (comp.bounding_box.min?.[0] || 0)),
          height: Math.abs((comp.bounding_box.max?.[1] || 0) - (comp.bounding_box.min?.[1] || 0)),
          length: Math.abs((comp.bounding_box.max?.[2] || 0) - (comp.bounding_box.min?.[2] || 0)),
        } : { width: 1, height: 1, length: 1 }),
        material: 'default',
        specifications: {},
        cost: 0,
        partNumber: `COMP-${comp.componentId}`,
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
    console.log('🚀 currentProjectId:', currentProjectId);
    console.log('🚀 Stack trace:', new Error().stack);
    
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
      
      const response = await fetch(`${API_BASE}/api/projects/${currentProjectId}/add_component/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
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
      
      // Use the backend response to create the component with correct data
      const newComponent: SceneComponent = {
        id: `comp-${assemblyItem.id}`,
        componentId: assemblyItem.component.id,
        name: assemblyItem.custom_name || assemblyItem.component.name || 'Unnamed Component',
        category: assemblyItem.component.category_label || assemblyItem.component.category || '',
        glb_url: assemblyItem.component.glb_url || null,
        original_url: assemblyItem.component.original_url || null,
        bounding_box: assemblyItem.component.bounding_box,
        center: assemblyItem.component.center,
        position: [assemblyItem.position_x || 0, assemblyItem.position_y || 0, assemblyItem.position_z || 0],
        rotation: [assemblyItem.rotation_x || 0, assemblyItem.rotation_y || 0, assemblyItem.rotation_z || 0] as [number, number, number],
      };
      
      console.log('✅ Created newComponent object:', newComponent);

      console.log('🎨 Adding component to scene:', newComponent);
      console.log('🎨 GLB URL:', newComponent.glb_url);
      console.log('🎨 Position:', newComponent.position);
      console.log('🎨 Current sceneComponents before add:', sceneComponents.length);
      
      // Use functional update to ensure we have the latest state
      // Only add if component doesn't already exist
      setSceneComponents(prev => {
        console.log('🔄 setSceneComponents called. Previous count:', prev.length);
        console.log('🔄 Previous component IDs:', prev.map(c => c.id));
        console.log('🔄 New component ID:', newComponent.id);
        console.log('🔄 New component backend ID:', assemblyItem.id);
        
        // Check if we've already tracked this component ID
        if (addedComponentIdsRef.current.has(newComponent.id)) {
          console.warn('⚠️ Component ID already tracked, skipping duplicate:', newComponent.id);
          return prev; // Don't add duplicate
        }
        
        // Check if component already exists by ID (most reliable check)
        const existingById = prev.find(c => c.id === newComponent.id);
        if (existingById) {
          console.warn('⚠️ Component already exists by ID, skipping duplicate:', newComponent.id);
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
          console.warn('⚠️ Component already exists by backend ID, skipping duplicate:', {
            existing: existingByBackendId.id,
            new: newComponent.id,
            backendId: backendId
          });
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
          console.warn('⚠️ Component with same type and very close position already exists, skipping:', {
            existing: duplicateByPosition.id,
            new: newComponent.id,
            position: newComponent.position
          });
          return prev; // Don't add duplicate
        }
        
        const updated = [...prev, newComponent];
        console.log('✅ Added new component. New count:', updated.length);
        console.log('✅ All component IDs after add:', updated.map(c => c.id));
        return updated;
      });
      
      // Don't reload all components - we already added the new one to state
      // This prevents duplicate components from being added
      
      // Track this component ID to prevent duplicates
      addedComponentIdsRef.current.add(newComponent.id);
      
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
    setSceneComponents(prev => prev.map(c => c.id === id ? { ...c, ...update } : c));
    
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

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  const handleDeleteComponent = async (id: string) => {
    if (!currentProjectId) {
      console.error('No project loaded, cannot delete component');
      return;
    }

    // Remove from local state immediately
    setSceneComponents(prev => prev.filter(c => c.id !== id));
    
    // Clear selection if the deleted component was selected
    if (selectedComponent?.id === id) {
      setSelectedComponent(null);
    }

    // Delete from backend
    try {
      const componentId = id.replace('comp-', '');
      const response = await fetch(`${API_BASE}/api/assembly-items/${componentId}/`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        console.error('Failed to delete component from backend:', response.status);
        // Optionally reload the scene to sync with backend
        // For now, we'll just log the error since we already removed from local state
      } else {
        console.log('✅ Successfully deleted component from backend');
      }
    } catch (error) {
      console.error('Error deleting component:', error);
    }
  };

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
            },
          };
        })
      };
      
      console.log('💾 Saving assembly:', {
        totalComponents: sceneComponents.length,
        uniqueComponents: payload.assembly_items.length,
        componentIds: payload.assembly_items.map(i => i.id)
      });
      
      const response = await fetch(`${API_BASE}/api/projects/${currentProjectId}/save/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        skipped: result.skipped || 0,
        errors: result.errors || []
      });
      
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

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
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
            onAddComponent={handleAddComponent}
            onUpdateComponent={handleUpdateComponent}
            activeTool={activeTool}
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
            <Tabs defaultValue="properties" className={`flex-1 flex flex-col ${rightCollapsed ? 'hidden' : ''}`}>
              <TabsList className="grid w-full grid-cols-2 bg-secondary mx-4 mt-2">
                <TabsTrigger value="properties">Properties</TabsTrigger>
                <TabsTrigger value="bom">BOM</TabsTrigger>
              </TabsList>
              <TabsContent value="properties" className="flex-1 mt-4 overflow-hidden min-h-0">
                <PropertiesPanel 
                  selectedComponent={selectedComponent}
                  onDeleteComponent={handleDeleteComponent}
                  onUpdateComponent={(component) => {
                    console.log('📦 PropertiesPanel onUpdateComponent called with:', component);
                    console.log('📦 Component dimensions provided:', component.dimensions);
                    
                    // Always update selectedComponent with the EXACT dimensions provided
                    // Do NOT recalculate from bounding box - use the values as-is
                    setSelectedComponent(component);
                    
                    // Also update the corresponding SceneComponent's bounding_box
                    // to reflect dimension changes in the 3D preview
                    if (component.dimensions && component.id) {
                      console.log('📦 Updating SceneComponent bounding_box for:', component.id);
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
                        
                        // Use the EXACT provided dimension values - do NOT recalculate from bounding box
                        // This ensures we use the values from AdjustDimensions component
                        const newWidth = (component.dimensions.width !== undefined && component.dimensions.width !== null && component.dimensions.width > 0)
                          ? Number(component.dimensions.width)
                          : Math.abs(oldMax[0] - oldMin[0]) || 1;
                        const newHeight = (component.dimensions.height !== undefined && component.dimensions.height !== null && component.dimensions.height > 0)
                          ? Number(component.dimensions.height)
                          : Math.abs(oldMax[1] - oldMin[1]) || 1;
                        const newLength = (component.dimensions.length !== undefined && component.dimensions.length !== null && component.dimensions.length > 0)
                          ? Number(component.dimensions.length)
                          : Math.abs(oldMax[2] - oldMin[2]) || 1;
                        
                        console.log('📏 Dimension update (using provided values):', { 
                          new: { newWidth, newHeight, newLength },
                          provided: component.dimensions 
                        });
                        
                        // Validate dimensions are reasonable (prevent huge jumps)
                        if (newWidth > 1000 || newHeight > 2000 || newLength > 10000) {
                          console.error('⚠️ Suspicious dimension values detected:', { newWidth, newHeight, newLength });
                          return; // Reject suspicious values
                        }
                        
                        // Create new bounding box centered at the same position
                        // Ensure dimensions are valid (at least 1mm)
                        const validWidth = Math.max(newWidth, 1);
                        const validHeight = Math.max(newHeight, 1);
                        const validLength = Math.max(newLength, 1);
                        
                        const newBoundingBox = {
                          min: [
                            oldCenter[0] - validWidth / 2,
                            oldCenter[1] - validHeight / 2,
                            oldCenter[2] - validLength / 2,
                          ],
                          max: [
                            oldCenter[0] + validWidth / 2,
                            oldCenter[1] + validHeight / 2,
                            oldCenter[2] + validLength / 2,
                          ],
                        };
                        
                        console.log('📦 New bounding box:', newBoundingBox);
                        console.log('📦 Calculated length:', validLength, 'from Z-axis:', newBoundingBox.max[2] - newBoundingBox.min[2]);
                        
                        handleUpdateComponent(component.id, {
                          bounding_box: newBoundingBox,
                        });
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
    </div>
  );
};

export default Index;
