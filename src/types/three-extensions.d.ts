declare module 'three/examples/jsm/loaders/STLLoader' {
  import { Loader, LoadingManager, BufferGeometry } from 'three';
  export class STLLoader extends Loader {
    constructor(manager?: LoadingManager);
    parse(data: ArrayBuffer | string): BufferGeometry;
    load(
      url: string,
      onLoad: (geometry: BufferGeometry) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
  }
}

declare module 'three/examples/jsm/loaders/OBJLoader' {
  import { Loader, LoadingManager, Group } from 'three';
  export class OBJLoader extends Loader {
    constructor(manager?: LoadingManager);
    parse(data: string): Group;
    load(
      url: string,
      onLoad: (group: Group) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ): void;
  }
}


