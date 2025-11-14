import { create } from "zustand";
import * as THREE from "three";
import { Slot, ConveyorParams, PlacedComponent, SlotType, ConveyorModel } from "@/lib/types";
import { generateSlots } from "@/lib/slots";
import { calculateDimensions } from "@/lib/params";
import { calculateOrientation } from "@/lib/placement";

interface PlacementState {
  // Conveyor parameters
  params: ConveyorParams;
  
  // Slots
  slots: Slot[];
  
  // Placed components
  components: PlacedComponent[];
  
  // UI state
  draggingType: SlotType | null;
  selectedComponentId: string | null;
  hoveredSlotId: string | null;
  
  // Actions
  updateParams: (updates: Partial<ConveyorParams>) => void;
  regenerateSlots: () => void;
  placeComponent: (type: SlotType, slotId: string, name: string, modelUrl?: string) => void;
  removeComponent: (componentId: string) => void;
  setDraggingType: (type: SlotType | null) => void;
  setSelectedComponent: (id: string | null) => void;
  setHoveredSlot: (id: string | null) => void;
}

const defaultParams: ConveyorParams = {
  L: 1000, // 1000mm default
  N: 500,  // 500mm default
  D: 1055, // Will be recalculated
  R: 567,  // Will be recalculated
  model: "DPS50",
  engineType: undefined,
  sideGuideEnabled: false,
  sideGuideHeight: 100,
  stopButtonSide: undefined,
  stopButtonEnd: undefined,
  stopButtonCount: { motor: 0, opposite: 0 },
  supportingFrame: false,
  frameHeight: 300,
  frameWheels: false,
};

export const usePlacementStore = create<PlacementState>((set, get) => {
  // Initialize params with calculated dimensions
  const initialParams = { ...defaultParams, ...calculateDimensions(defaultParams.L, defaultParams.N, defaultParams.model) };
  
  // Generate initial slots
  const initialSlots = generateSlots(initialParams);
  
  return {
    params: initialParams,
    slots: initialSlots,
    components: [],
    draggingType: null,
    selectedComponentId: null,
    hoveredSlotId: null,

  updateParams: (updates) => {
    set((state) => {
      const newParams = { ...state.params, ...updates };
      
      // Recalculate D and R if L, N, or model changed
      if (updates.L !== undefined || updates.N !== undefined || updates.model !== undefined) {
        const { D, R } = calculateDimensions(
          newParams.L,
          newParams.N,
          newParams.model
        );
        newParams.D = D;
        newParams.R = R;
      }

      return { params: newParams };
    });
    
    // Regenerate slots when params change
    get().regenerateSlots();
  },

  regenerateSlots: () => {
    const { params, components } = get();
    const newSlots = generateSlots(params);
    
    // Preserve occupiedBy assignments from existing components
    const updatedSlots = newSlots.map((slot) => {
      const component = components.find((c) => c.slotId === slot.id);
      return component ? { ...slot, occupiedBy: component.id } : slot;
    });

    set({ slots: updatedSlots });
  },

  placeComponent: (type, slotId, name, modelUrl) => {
    const { slots, components } = get();
    const slot = slots.find((s) => s.id === slotId);
    
    if (!slot || slot.occupiedBy) {
      return; // Invalid or occupied slot
    }

    const componentId = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const rotation = calculateOrientation(slot);
    
    const newComponent: PlacedComponent = {
      id: componentId,
      type,
      slotId,
      position: slot.position.clone(),
      rotation,
      modelUrl,
      name,
    };

    // Update slots to mark as occupied
    const updatedSlots = slots.map((s) =>
      s.id === slotId ? { ...s, occupiedBy: componentId } : s
    );

    set({
      components: [...components, newComponent],
      slots: updatedSlots,
      draggingType: null,
    });
  },

  removeComponent: (componentId) => {
    const { components, slots } = get();
    const component = components.find((c) => c.id === componentId);
    
    if (!component) return;

    // Release the slot
    const updatedSlots = slots.map((s) =>
      s.id === component.slotId ? { ...s, occupiedBy: undefined } : s
    );

    set({
      components: components.filter((c) => c.id !== componentId),
      slots: updatedSlots,
      selectedComponentId: get().selectedComponentId === componentId ? null : get().selectedComponentId,
    });
  },

  setDraggingType: (type) => {
    set({ draggingType: type });
  },

  setSelectedComponent: (id) => {
    set({ selectedComponentId: id });
  },

  setHoveredSlot: (id) => {
    set({ hoveredSlotId: id });
  },
  };
});

