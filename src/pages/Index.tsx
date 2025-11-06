import { useState, useEffect } from 'react';
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
  const [sceneComponents, setSceneComponents] = useState<SceneComponent[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);

  const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://localhost:8000";

  // Load project assembly on mount
  useEffect(() => {
    const loadProject = async () => {
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
          console.log('Assembly items loaded:', items.length);
          
          const loadedComponents: SceneComponent[] = items.map((item: any) => ({
            id: `comp-${item.id}`,
            componentId: item.component.id,
            name: item.custom_name || item.component.name,
            category: item.component.category_label || item.component.category || '',
            glb_url: item.component.glb_url || item.component.glb_file_url,
            original_url: item.component.original_url || item.component.original_file_url,
            bounding_box: item.component.bounding_box,
            center: item.component.center,
            position: [item.position_x, item.position_y, item.position_z],
            rotation: [item.rotation_x, item.rotation_y, item.rotation_z] as [number, number, number],
          }));
          
          console.log('Loaded components:', loadedComponents);
          setSceneComponents(loadedComponents);
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
            return;
          }
          
          const newProject = await createRes.json();
          console.log('Created new project:', newProject.id);
          setCurrentProjectId(newProject.id);
        }
      } catch (error) {
        console.error('Failed to load project:', error);
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
      setSelectedComponent({
        id: comp.id,
        type: comp.category.toLowerCase() as any,
        name: comp.name,
        position: comp.position,
        rotation: comp.rotation || [0, 0, 0],
        dimensions: comp.bounding_box ? {
          width: (comp.bounding_box.max?.[0] || 0) - (comp.bounding_box.min?.[0] || 0),
          height: (comp.bounding_box.max?.[1] || 0) - (comp.bounding_box.min?.[1] || 0),
          length: (comp.bounding_box.max?.[2] || 0) - (comp.bounding_box.min?.[2] || 0),
        } : { width: 1, height: 1, length: 1 },
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
    console.log('🚀 handleAddComponent called with:', component);
    console.log('🚀 currentProjectId:', currentProjectId);
    
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
            // Retry adding component after setting project
            setTimeout(() => handleAddComponent(component), 100);
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
              // Retry adding component after creating project
              setTimeout(() => handleAddComponent(component), 100);
              return;
            }
          }
        }
      } catch (e) {
        console.error('Failed to load/create project:', e);
      }
      return;
    }

    // Save to backend first, then add to state with response data
    try {
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
      setSceneComponents(prev => {
        console.log('🔄 setSceneComponents called. Previous count:', prev.length);
        // Check if component already exists
        const existingIndex = prev.findIndex(c => c.id === newComponent.id);
        if (existingIndex >= 0) {
          console.warn('⚠️ Component already exists, updating instead of adding:', newComponent.id);
          const updated = [...prev];
          updated[existingIndex] = newComponent;
          console.log('✅ Updated existing component. Total count:', updated.length);
          return updated;
        }
        const updated = [...prev, newComponent];
        console.log('✅ Added new component. New count:', updated.length);
        console.log('✅ All components:', updated.map(c => ({ id: c.id, name: c.name, position: c.position, glb_url: c.glb_url })));
        return updated;
      });
      
      // Reload assembly items from backend to ensure consistency
      // This ensures the component we just added is in sync with backend
      try {
        console.log('🔄 Reloading assembly items from backend...');
        const itemsRes = await fetch(`${API_BASE}/api/assembly-items/?project_id=${currentProjectId}`, {
          credentials: 'include',
        });
        
        if (itemsRes.ok) {
          const itemsData = await itemsRes.json();
          const items = Array.isArray(itemsData) ? itemsData : itemsData.results || [];
          console.log('✅ Reloaded assembly items:', items.length);
          
          const reloadedComponents: SceneComponent[] = items.map((item: any) => ({
            id: `comp-${item.id}`,
            componentId: item.component.id,
            name: item.custom_name || item.component.name,
            category: item.component.category_label || item.component.category || '',
            glb_url: item.component.glb_url || item.component.glb_file_url || null,
            original_url: item.component.original_url || item.component.original_file_url || null,
            bounding_box: item.component.bounding_box,
            center: item.component.center,
            position: [item.position_x || 0, item.position_y || 0, item.position_z || 0],
            rotation: [item.rotation_x || 0, item.rotation_y || 0, item.rotation_z || 0] as [number, number, number],
          }));
          
          console.log('✅ Setting reloaded components:', reloadedComponents.length);
          setSceneComponents(reloadedComponents);
          
          // Verify the component we just added is in the reloaded list
          const found = reloadedComponents.find(c => c.id === newComponent.id);
          if (found) {
            console.log('✅ Component confirmed in reloaded list:', found.name);
          } else {
            console.warn('⚠️ Component not found in reloaded list, but it should be there');
          }
        } else {
          console.warn('⚠️ Failed to reload assembly items, but component was added to local state');
        }
      } catch (reloadError) {
        console.error('❌ Error reloading assembly items:', reloadError);
        // Component was already added to local state, so continue
      }
    } catch (error) {
      console.error('❌ Failed to save component to backend:', error);
    }
  };

  const handleUpdateComponent = async (id: string, update: Partial<SceneComponent>) => {
    setSceneComponents(prev => prev.map(c => c.id === id ? { ...c, ...update } : c));
    
    // Auto-save position/rotation changes to backend
    if ((update.position || update.rotation) && currentProjectId) {
      const component = sceneComponents.find(c => c.id === id);
      if (component) {
        const updated = { ...component, ...update };
        try {
          await fetch(`${API_BASE}/api/projects/${currentProjectId}/save/`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assembly_items: [{
                id: id.replace('comp-', ''),
                position_x: updated.position[0],
                position_y: updated.position[1],
                position_z: updated.position[2],
                rotation_x: (updated.rotation || [0,0,0])[0],
                rotation_y: (updated.rotation || [0,0,0])[1],
                rotation_z: (updated.rotation || [0,0,0])[2],
                rotation_w: 1,
              }],
            }),
          });
        } catch (error) {
          console.error('Failed to auto-save component update:', error);
        }
      }
    }
  };

  const saveAssembly = async () => {
    if (!currentProjectId) {
      console.error('No project to save to');
      return;
    }
    
    const payload = {
      assembly_items: sceneComponents.map((c, idx) => ({
        id: undefined,
        position_x: c.position[0],
        position_y: c.position[1],
        position_z: c.position[2],
        rotation_x: (c.rotation || [0,0,0])[0],
        rotation_y: (c.rotation || [0,0,0])[1],
        rotation_z: (c.rotation || [0,0,0])[2],
        rotation_w: 1,
        scale_x: 1, scale_y: 1, scale_z: 1,
        metadata: { componentId: c.componentId, name: c.name, category: c.category },
        order: idx,
      }))
    };
    try {
      await fetch(`${API_BASE}/api/projects/${currentProjectId}/save/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      console.log('Assembly saved');
    } catch (e) {
      console.error('Save failed', e);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Toolbar */}
      <Toolbar 
        onToolSelect={setActiveTool} 
        activeTool={activeTool} 
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
            components={sceneComponents}
            onAddComponent={handleAddComponent}
            onUpdateComponent={handleUpdateComponent}
            activeTool={activeTool}
          />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          <Button size="sm" variant="secondary" onClick={saveAssembly}>Save Assembly</Button>
        </div>
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
              <TabsContent value="properties" className="flex-1 mt-4 overflow-hidden">
                <PropertiesPanel 
                  selectedComponent={selectedComponent}
                  onUpdateComponent={(component) => {
                    console.log('📦 PropertiesPanel onUpdateComponent called with:', component);
                    setSelectedComponent(component);
                    
                    // Also update the corresponding SceneComponent's bounding_box
                    // to reflect dimension changes in the 3D preview
                    if (component.dimensions && component.id) {
                      console.log('📦 Updating SceneComponent bounding_box for:', component.id);
                      const sceneComp = sceneComponents.find(c => c.id === component.id);
                      if (sceneComp && sceneComp.bounding_box) {
                        // Calculate center of current bounding box to preserve position
                        const oldMin = sceneComp.bounding_box.min || [0, 0, 0];
                        const oldMax = sceneComp.bounding_box.max || [0, 0, 0];
                        const oldCenter = [
                          (oldMin[0] + oldMax[0]) / 2,
                          (oldMin[1] + oldMax[1]) / 2,
                          (oldMin[2] + oldMax[2]) / 2,
                        ];
                        
                        // Calculate new dimensions (preserve height if not changed)
                        const newWidth = component.dimensions.width || (oldMax[0] - oldMin[0]);
                        const newHeight = component.dimensions.height || (oldMax[1] - oldMin[1]);
                        const newLength = component.dimensions.length || (oldMax[2] - oldMin[2]);
                        
                        // Create new bounding box centered at the same position
                        const newBoundingBox = {
                          min: [
                            oldCenter[0] - newWidth / 2,
                            oldCenter[1] - newHeight / 2,
                            oldCenter[2] - newLength / 2,
                          ],
                          max: [
                            oldCenter[0] + newWidth / 2,
                            oldCenter[1] + newHeight / 2,
                            oldCenter[2] + newLength / 2,
                          ],
                        };
                        
                        handleUpdateComponent(component.id, {
                          bounding_box: newBoundingBox,
                        });
                      }
                    }
                  }}
                />
              </TabsContent>
              <TabsContent value="bom" className="flex-1 mt-4 overflow-hidden">
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
