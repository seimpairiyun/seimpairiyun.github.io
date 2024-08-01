// MeshSurfaceSampler_20210711
(function () {
  const _face = new THREE.Triangle();
  const _color = new THREE.Vector3();
  class MeshSurfaceSampler {
    constructor(mesh) {
      let geometry = mesh.geometry;
      if (
        !geometry.isBufferGeometry ||
        geometry.attributes.position.itemSize !== 3
      ) {
        throw new Error(
          "THREE.MeshSurfaceSampler: Requires BufferGeometry triangle mesh."
        );
      }
      if (geometry.index) {
        console.warn(
          "THREE.MeshSurfaceSampler: Converting geometry to non-indexed BufferGeometry."
        );
        geometry = geometry.toNonIndexed();
      }
      this.geometry = geometry;
      this.randomFunction = Math.random;
      this.positionAttribute = this.geometry.getAttribute("position");
      this.colorAttribute = this.geometry.getAttribute("color");
      this.weightAttribute = null;
      this.distribution = null;
    }
    setWeightAttribute(name) {
      this.weightAttribute = name ? this.geometry.getAttribute(name) : null;
      return this;
    }
    build() {
      const positionAttribute = this.positionAttribute;
      const weightAttribute = this.weightAttribute;
      const faceWeights = new Float32Array(positionAttribute.count / 3);
      for (let i = 0; i < positionAttribute.count; i += 3) {
        let faceWeight = 1;
        if (weightAttribute) {
          faceWeight =
            weightAttribute.getX(i) +
            weightAttribute.getX(i + 1) +
            weightAttribute.getX(i + 2);
        }
        _face.a.fromBufferAttribute(positionAttribute, i);
        _face.b.fromBufferAttribute(positionAttribute, i + 1);
        _face.c.fromBufferAttribute(positionAttribute, i + 2);
        faceWeight *= _face.getArea();
        faceWeights[i / 3] = faceWeight;
      }
      this.distribution = new Float32Array(positionAttribute.count / 3);
      let cumulativeTotal = 0;
      for (let i = 0; i < faceWeights.length; i++) {
        cumulativeTotal += faceWeights[i];
        this.distribution[i] = cumulativeTotal;
      }
      return this;
    }
    setRandomGenerator(randomFunction) {
      this.randomFunction = randomFunction;
      return this;
    }
    sample(targetPosition, targetNormal, targetColor) {
      const cumulativeTotal = this.distribution[this.distribution.length - 1];
      const faceIndex = this.binarySearch(
        this.randomFunction() * cumulativeTotal
      );
      return this.sampleFace(
        faceIndex,
        targetPosition,
        targetNormal,
        targetColor
      );
    }
    binarySearch(x) {
      const dist = this.distribution;
      let start = 0;
      let end = dist.length - 1;
      let index = -1;
      while (start <= end) {
        const mid = Math.ceil((start + end) / 2);
        if (mid === 0 || (dist[mid - 1] <= x && dist[mid] > x)) {
          index = mid;
          break;
        } else if (x < dist[mid]) {
          end = mid - 1;
        } else {
          start = mid + 1;
        }
      }
      return index;
    }
    sampleFace(faceIndex, targetPosition, targetNormal, targetColor) {
      let u = this.randomFunction();
      let v = this.randomFunction();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      _face.a.fromBufferAttribute(this.positionAttribute, faceIndex * 3);
      _face.b.fromBufferAttribute(this.positionAttribute, faceIndex * 3 + 1);
      _face.c.fromBufferAttribute(this.positionAttribute, faceIndex * 3 + 2);
      targetPosition
        .set(0, 0, 0)
        .addScaledVector(_face.a, u)
        .addScaledVector(_face.b, v)
        .addScaledVector(_face.c, 1 - (u + v));
      if (targetNormal !== undefined) {
        _face.getNormal(targetNormal);
      }
      if (targetColor !== undefined && this.colorAttribute !== undefined) {
        _face.a.fromBufferAttribute(this.colorAttribute, faceIndex * 3);
        _face.b.fromBufferAttribute(this.colorAttribute, faceIndex * 3 + 1);
        _face.c.fromBufferAttribute(this.colorAttribute, faceIndex * 3 + 2);
        _color
          .set(0, 0, 0)
          .addScaledVector(_face.a, u)
          .addScaledVector(_face.b, v)
          .addScaledVector(_face.c, 1 - (u + v));
        targetColor.r = _color.x;
        targetColor.g = _color.y;
        targetColor.b = _color.z;
      }
      return this;
    }
  }
  THREE.MeshSurfaceSampler = MeshSurfaceSampler;
})();

// OBJLoader_20210711
(function () {
  const _object_pattern = /^[og]\s*(.+)?/;
  const _material_library_pattern = /^mtllib /;
  const _material_use_pattern = /^usemtl /;
  const _map_use_pattern = /^usemap /;
  const _vA = new THREE.Vector3();
  const _vB = new THREE.Vector3();
  const _vC = new THREE.Vector3();
  const _ab = new THREE.Vector3();
  const _cb = new THREE.Vector3();
  function ParserState() {
    const state = {
      objects: [],
      object: {},
      vertices: [],
      normals: [],
      colors: [],
      uvs: [],
      materials: {},
      materialLibraries: [],
      startObject: function (name, fromDeclaration) {
        if (this.object && this.object.fromDeclaration === false) {
          this.object.name = name;
          this.object.fromDeclaration = fromDeclaration !== false;
          return;
        }
        const previousMaterial =
          this.object && typeof this.object.currentMaterial === "function"
            ? this.object.currentMaterial()
            : undefined;
        if (this.object && typeof this.object._finalize === "function") {
          this.object._finalize(true);
        }
        this.object = {
          name: name || "",
          fromDeclaration: fromDeclaration !== false,
          geometry: {
            vertices: [],
            normals: [],
            colors: [],
            uvs: [],
            hasUVIndices: false,
          },
          materials: [],
          smooth: true,
          startMaterial: function (name, libraries) {
            const previous = this._finalize(false);
            if (previous && (previous.inherited || previous.groupCount <= 0)) {
              this.materials.splice(previous.index, 1);
            }
            const material = {
              index: this.materials.length,
              name: name || "",
              mtllib:
                Array.isArray(libraries) && libraries.length > 0
                  ? libraries[libraries.length - 1]
                  : "",
              smooth: previous !== undefined ? previous.smooth : this.smooth,
              groupStart: previous !== undefined ? previous.groupEnd : 0,
              groupEnd: -1,
              groupCount: -1,
              inherited: false,
              clone: function (index) {
                const cloned = {
                  index: typeof index === "number" ? index : this.index,
                  name: this.name,
                  mtllib: this.mtllib,
                  smooth: this.smooth,
                  groupStart: 0,
                  groupEnd: -1,
                  groupCount: -1,
                  inherited: false,
                };
                cloned.clone = this.clone.bind(cloned);
                return cloned;
              },
            };
            this.materials.push(material);
            return material;
          },
          currentMaterial: function () {
            if (this.materials.length > 0) {
              return this.materials[this.materials.length - 1];
            }
            return undefined;
          },
          _finalize: function (end) {
            const lastMultiMaterial = this.currentMaterial();
            if (lastMultiMaterial && lastMultiMaterial.groupEnd === -1) {
              lastMultiMaterial.groupEnd = this.geometry.vertices.length / 3;
              lastMultiMaterial.groupCount =
                lastMultiMaterial.groupEnd - lastMultiMaterial.groupStart;
              lastMultiMaterial.inherited = false;
            }
            if (end && this.materials.length > 1) {
              for (let mi = this.materials.length - 1; mi >= 0; mi--) {
                if (this.materials[mi].groupCount <= 0) {
                  this.materials.splice(mi, 1);
                }
              }
            }
            if (end && this.materials.length === 0) {
              this.materials.push({ name: "", smooth: this.smooth });
            }
            return lastMultiMaterial;
          },
        };
        if (
          previousMaterial &&
          previousMaterial.name &&
          typeof previousMaterial.clone === "function"
        ) {
          const declared = previousMaterial.clone(0);
          declared.inherited = true;
          this.object.materials.push(declared);
        }
        this.objects.push(this.object);
      },
      finalize: function () {
        if (this.object && typeof this.object._finalize === "function") {
          this.object._finalize(true);
        }
      },
      parseVertexIndex: function (value, len) {
        const index = parseInt(value, 10);
        return (index >= 0 ? index - 1 : index + len / 3) * 3;
      },
      parseNormalIndex: function (value, len) {
        const index = parseInt(value, 10);
        return (index >= 0 ? index - 1 : index + len / 3) * 3;
      },
      parseUVIndex: function (value, len) {
        const index = parseInt(value, 10);
        return (index >= 0 ? index - 1 : index + len / 2) * 2;
      },
      addVertex: function (a, b, c) {
        const src = this.vertices;
        const dst = this.object.geometry.vertices;
        dst.push(src[a + 0], src[a + 1], src[a + 2]);
        dst.push(src[b + 0], src[b + 1], src[b + 2]);
        dst.push(src[c + 0], src[c + 1], src[c + 2]);
      },
      addVertexPoint: function (a) {
        const src = this.vertices;
        const dst = this.object.geometry.vertices;
        dst.push(src[a + 0], src[a + 1], src[a + 2]);
      },
      addVertexLine: function (a) {
        const src = this.vertices;
        const dst = this.object.geometry.vertices;
        dst.push(src[a + 0], src[a + 1], src[a + 2]);
      },
      addNormal: function (a, b, c) {
        const src = this.normals;
        const dst = this.object.geometry.normals;
        dst.push(src[a + 0], src[a + 1], src[a + 2]);
        dst.push(src[b + 0], src[b + 1], src[b + 2]);
        dst.push(src[c + 0], src[c + 1], src[c + 2]);
      },
      addFaceNormal: function (a, b, c) {
        const src = this.vertices;
        const dst = this.object.geometry.normals;
        _vA.fromArray(src, a);
        _vB.fromArray(src, b);
        _vC.fromArray(src, c);
        _cb.subVectors(_vC, _vB);
        _ab.subVectors(_vA, _vB);
        _cb.cross(_ab);
        _cb.normalize();
        dst.push(_cb.x, _cb.y, _cb.z);
        dst.push(_cb.x, _cb.y, _cb.z);
        dst.push(_cb.x, _cb.y, _cb.z);
      },
      addColor: function (a, b, c) {
        const src = this.colors;
        const dst = this.object.geometry.colors;
        if (src[a] !== undefined) dst.push(src[a + 0], src[a + 1], src[a + 2]);
        if (src[b] !== undefined) dst.push(src[b + 0], src[b + 1], src[b + 2]);
        if (src[c] !== undefined) dst.push(src[c + 0], src[c + 1], src[c + 2]);
      },
      addUV: function (a, b, c) {
        const src = this.uvs;
        const dst = this.object.geometry.uvs;
        dst.push(src[a + 0], src[a + 1]);
        dst.push(src[b + 0], src[b + 1]);
        dst.push(src[c + 0], src[c + 1]);
      },
      addDefaultUV: function () {
        const dst = this.object.geometry.uvs;
        dst.push(0, 0);
        dst.push(0, 0);
        dst.push(0, 0);
      },
      addUVLine: function (a) {
        const src = this.uvs;
        const dst = this.object.geometry.uvs;
        dst.push(src[a + 0], src[a + 1]);
      },
      addFace: function (a, b, c, ua, ub, uc, na, nb, nc) {
        const vLen = this.vertices.length;
        let ia = this.parseVertexIndex(a, vLen);
        let ib = this.parseVertexIndex(b, vLen);
        let ic = this.parseVertexIndex(c, vLen);
        this.addVertex(ia, ib, ic);
        this.addColor(ia, ib, ic);
        if (na !== undefined && na !== "") {
          const nLen = this.normals.length;
          ia = this.parseNormalIndex(na, nLen);
          ib = this.parseNormalIndex(nb, nLen);
          ic = this.parseNormalIndex(nc, nLen);
          this.addNormal(ia, ib, ic);
        } else {
          this.addFaceNormal(ia, ib, ic);
        }
        if (ua !== undefined && ua !== "") {
          const uvLen = this.uvs.length;
          ia = this.parseUVIndex(ua, uvLen);
          ib = this.parseUVIndex(ub, uvLen);
          ic = this.parseUVIndex(uc, uvLen);
          this.addUV(ia, ib, ic);
          this.object.geometry.hasUVIndices = true;
        } else {
          this.addDefaultUV();
        }
      },
      addPointGeometry: function (vertices) {
        this.object.geometry.type = "Points";
        const vLen = this.vertices.length;
        for (let vi = 0, l = vertices.length; vi < l; vi++) {
          const index = this.parseVertexIndex(vertices[vi], vLen);
          this.addVertexPoint(index);
          this.addColor(index);
        }
      },
      addLineGeometry: function (vertices, uvs) {
        this.object.geometry.type = "Line";
        const vLen = this.vertices.length;
        const uvLen = this.uvs.length;
        for (let vi = 0, l = vertices.length; vi < l; vi++) {
          this.addVertexLine(this.parseVertexIndex(vertices[vi], vLen));
        }
        for (let uvi = 0, l = uvs.length; uvi < l; uvi++) {
          this.addUVLine(this.parseUVIndex(uvs[uvi], uvLen));
        }
      },
    };
    state.startObject("", false);
    return state;
  }
  class OBJLoader extends THREE.Loader {
    constructor(manager) {
      super(manager);
      this.materials = null;
    }
    load(url, onLoad, onProgress, onError) {
      const scope = this;
      const loader = new THREE.FileLoader(this.manager);
      loader.setPath(this.path);
      loader.setRequestHeader(this.requestHeader);
      loader.setWithCredentials(this.withCredentials);
      loader.load(
        url,
        function (text) {
          try {
            onLoad(scope.parse(text));
          } catch (e) {
            if (onError) {
              onError(e);
            } else {
              console.error(e);
            }
            scope.manager.itemError(url);
          }
        },
        onProgress,
        onError
      );
    }
    setMaterials(materials) {
      this.materials = materials;
      return this;
    }
    parse(text) {
      const state = new ParserState();
      if (text.indexOf("\r\n") !== -1) {
        text = text.replace(/\r\n/g, "\n");
      }
      if (text.indexOf("\\\n") !== -1) {
        text = text.replace(/\\\n/g, "");
      }
      const lines = text.split("\n");
      let line = "",
        lineFirstChar = "";
      let lineLength = 0;
      let result = [];
      const trimLeft = typeof "".trimLeft === "function";
      for (let i = 0, l = lines.length; i < l; i++) {
        line = lines[i];
        line = trimLeft ? line.trimLeft() : line.trim();
        lineLength = line.length;
        if (lineLength === 0) continue;
        lineFirstChar = line.charAt(0);
        if (lineFirstChar === "#") continue;
        if (lineFirstChar === "v") {
          const data = line.split(/\s+/);
          switch (data[0]) {
            case "v":
              state.vertices.push(
                parseFloat(data[1]),
                parseFloat(data[2]),
                parseFloat(data[3])
              );
              if (data.length >= 7) {
                state.colors.push(
                  parseFloat(data[4]),
                  parseFloat(data[5]),
                  parseFloat(data[6])
                );
              } else {
                state.colors.push(undefined, undefined, undefined);
              }
              break;
            case "vn":
              state.normals.push(
                parseFloat(data[1]),
                parseFloat(data[2]),
                parseFloat(data[3])
              );
              break;
            case "vt":
              state.uvs.push(parseFloat(data[1]), parseFloat(data[2]));
              break;
          }
        } else if (lineFirstChar === "f") {
          const lineData = line.substr(1).trim();
          const vertexData = lineData.split(/\s+/);
          const faceVertices = [];
          for (let j = 0, jl = vertexData.length; j < jl; j++) {
            const vertex = vertexData[j];
            if (vertex.length > 0) {
              const vertexParts = vertex.split("/");
              faceVertices.push(vertexParts);
            }
          }
          const v1 = faceVertices[0];
          for (let j = 1, jl = faceVertices.length - 1; j < jl; j++) {
            const v2 = faceVertices[j];
            const v3 = faceVertices[j + 1];
            state.addFace(
              v1[0],
              v2[0],
              v3[0],
              v1[1],
              v2[1],
              v3[1],
              v1[2],
              v2[2],
              v3[2]
            );
          }
        } else if (lineFirstChar === "l") {
          const lineParts = line.substring(1).trim().split(" ");
          let lineVertices = [];
          const lineUVs = [];
          if (line.indexOf("/") === -1) {
            lineVertices = lineParts;
          } else {
            for (let li = 0, llen = lineParts.length; li < llen; li++) {
              const parts = lineParts[li].split("/");
              if (parts[0] !== "") lineVertices.push(parts[0]);
              if (parts[1] !== "") lineUVs.push(parts[1]);
            }
          }
          state.addLineGeometry(lineVertices, lineUVs);
        } else if (lineFirstChar === "p") {
          const lineData = line.substr(1).trim();
          const pointData = lineData.split(" ");
          state.addPointGeometry(pointData);
        } else if ((result = _object_pattern.exec(line)) !== null) {
          const name = (" " + result[0].substr(1).trim()).substr(1);
          state.startObject(name);
        } else if (_material_use_pattern.test(line)) {
          state.object.startMaterial(
            line.substring(7).trim(),
            state.materialLibraries
          );
        } else if (_material_library_pattern.test(line)) {
          state.materialLibraries.push(line.substring(7).trim());
        } else if (_map_use_pattern.test(line)) {
          console.warn(
            'THREE.OBJLoader: Rendering identifier "usemap" not supported. Textures must be defined in MTL files.'
          );
        } else if (lineFirstChar === "s") {
          result = line.split(" ");
          if (result.length > 1) {
            const value = result[1].trim().toLowerCase();
            state.object.smooth = value !== "0" && value !== "off";
          } else {
            state.object.smooth = true;
          }
          const material = state.object.currentMaterial();
          if (material) material.smooth = state.object.smooth;
        } else {
          if (line === "\0") continue;
          console.warn('THREE.OBJLoader: Unexpected line: "' + line + '"');
        }
      }
      state.finalize();
      const container = new THREE.Group();
      container.materialLibraries = [].concat(state.materialLibraries);
      const hasPrimitives = !(
        state.objects.length === 1 &&
        state.objects[0].geometry.vertices.length === 0
      );
      if (hasPrimitives === true) {
        for (let i = 0, l = state.objects.length; i < l; i++) {
          const object = state.objects[i];
          const geometry = object.geometry;
          const materials = object.materials;
          const isLine = geometry.type === "Line";
          const isPoints = geometry.type === "Points";
          let hasVertexColors = false;
          if (geometry.vertices.length === 0) continue;
          const buffergeometry = new THREE.BufferGeometry();
          buffergeometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(geometry.vertices, 3)
          );
          if (geometry.normals.length > 0) {
            buffergeometry.setAttribute(
              "normal",
              new THREE.Float32BufferAttribute(geometry.normals, 3)
            );
          }
          if (geometry.colors.length > 0) {
            hasVertexColors = true;
            buffergeometry.setAttribute(
              "color",
              new THREE.Float32BufferAttribute(geometry.colors, 3)
            );
          }
          if (geometry.hasUVIndices === true) {
            buffergeometry.setAttribute(
              "uv",
              new THREE.Float32BufferAttribute(geometry.uvs, 2)
            );
          }
          const createdMaterials = [];
          for (let mi = 0, miLen = materials.length; mi < miLen; mi++) {
            const sourceMaterial = materials[mi];
            const materialHash =
              sourceMaterial.name +
              "_" +
              sourceMaterial.smooth +
              "_" +
              hasVertexColors;
            let material = state.materials[materialHash];
            if (this.materials !== null) {
              material = this.materials.create(sourceMaterial.name);
              if (
                isLine &&
                material &&
                !(material instanceof THREE.LineBasicMaterial)
              ) {
                const materialLine = new THREE.LineBasicMaterial();
                THREE.Material.prototype.copy.call(materialLine, material);
                materialLine.color.copy(material.color);
                material = materialLine;
              } else if (
                isPoints &&
                material &&
                !(material instanceof THREE.PointsMaterial)
              ) {
                const materialPoints = new THREE.PointsMaterial({
                  size: 10,
                  sizeAttenuation: false,
                });
                THREE.Material.prototype.copy.call(materialPoints, material);
                materialPoints.color.copy(material.color);
                materialPoints.map = material.map;
                material = materialPoints;
              }
            }
            if (material === undefined) {
              if (isLine) {
                material = new THREE.LineBasicMaterial();
              } else if (isPoints) {
                material = new THREE.PointsMaterial({
                  size: 1,
                  sizeAttenuation: false,
                });
              } else {
                material = new THREE.MeshPhongMaterial();
              }
              material.name = sourceMaterial.name;
              material.flatShading = sourceMaterial.smooth ? false : true;
              material.vertexColors = hasVertexColors;
              state.materials[materialHash] = material;
            }
            createdMaterials.push(material);
          }
          let mesh;
          if (createdMaterials.length > 1) {
            for (let mi = 0, miLen = materials.length; mi < miLen; mi++) {
              const sourceMaterial = materials[mi];
              buffergeometry.addGroup(
                sourceMaterial.groupStart,
                sourceMaterial.groupCount,
                mi
              );
            }
            if (isLine) {
              mesh = new THREE.LineSegments(buffergeometry, createdMaterials);
            } else if (isPoints) {
              mesh = new THREE.Points(buffergeometry, createdMaterials);
            } else {
              mesh = new THREE.Mesh(buffergeometry, createdMaterials);
            }
          } else {
            if (isLine) {
              mesh = new THREE.LineSegments(
                buffergeometry,
                createdMaterials[0]
              );
            } else if (isPoints) {
              mesh = new THREE.Points(buffergeometry, createdMaterials[0]);
            } else {
              mesh = new THREE.Mesh(buffergeometry, createdMaterials[0]);
            }
          }
          mesh.name = object.name;
          container.add(mesh);
        }
      } else {
        if (state.vertices.length > 0) {
          const material = new THREE.PointsMaterial({
            size: 1,
            sizeAttenuation: false,
          });
          const buffergeometry = new THREE.BufferGeometry();
          buffergeometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(state.vertices, 3)
          );
          if (state.colors.length > 0 && state.colors[0] !== undefined) {
            buffergeometry.setAttribute(
              "color",
              new THREE.Float32BufferAttribute(state.colors, 3)
            );
            material.vertexColors = true;
          }
          const points = new THREE.Points(buffergeometry, material);
          container.add(points);
        }
      }
      return container;
    }
  }
  THREE.OBJLoader = OBJLoader;
})();

// three@0.131.3 | postprocessing/TrackballControls
(function () {
  const _changeEvent = {
    type: "change",
  };
  const _startEvent = {
    type: "start",
  };
  const _endEvent = {
    type: "end",
  };

  class TrackballControls extends THREE.EventDispatcher {
    constructor(object, domElement) {
      super();
      if (domElement === undefined)
        console.warn(
          'THREE.TrackballControls: The second parameter "domElement" is now mandatory.'
        );
      if (domElement === document)
        console.error(
          'THREE.TrackballControls: "document" should not be used as the target "domElement". Please use "renderer.domElement" instead.'
        );
      const scope = this;
      const STATE = {
        NONE: -1,
        ROTATE: 0,
        ZOOM: 1,
        PAN: 2,
        TOUCH_ROTATE: 3,
        TOUCH_ZOOM_PAN: 4,
      };
      this.object = object;
      this.domElement = domElement;
      this.domElement.style.touchAction = "none"; // disable touch scroll
      // API

      this.enabled = true;
      this.screen = {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      };
      this.rotateSpeed = 1.0;
      this.zoomSpeed = 1.2;
      this.panSpeed = 0.3;
      this.noRotate = false;
      this.noZoom = false;
      this.noPan = false;
      this.staticMoving = false;
      this.dynamicDampingFactor = 0.2;
      this.minDistance = 0;
      this.maxDistance = Infinity;
      this.keys = [
        "KeyA",
        /*A*/
        "KeyS",
        /*S*/
        "KeyD",
        /*D*/
      ];
      this.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }; // internals

      this.target = new THREE.Vector3();
      const EPS = 0.000001;
      const lastPosition = new THREE.Vector3();
      let lastZoom = 1;
      let _state = STATE.NONE,
        _keyState = STATE.NONE,
        _touchZoomDistanceStart = 0,
        _touchZoomDistanceEnd = 0,
        _lastAngle = 0;

      const _eye = new THREE.Vector3(),
        _movePrev = new THREE.Vector2(),
        _moveCurr = new THREE.Vector2(),
        _lastAxis = new THREE.Vector3(),
        _zoomStart = new THREE.Vector2(),
        _zoomEnd = new THREE.Vector2(),
        _panStart = new THREE.Vector2(),
        _panEnd = new THREE.Vector2(),
        _pointers = [],
        _pointerPositions = {}; // for reset

      this.target0 = this.target.clone();
      this.position0 = this.object.position.clone();
      this.up0 = this.object.up.clone();
      this.zoom0 = this.object.zoom; // methods

      this.handleResize = function () {
        const box = scope.domElement.getBoundingClientRect(); // adjustments come from similar code in the jquery offset() function

        const d = scope.domElement.ownerDocument.documentElement;
        scope.screen.left = box.left + window.pageXOffset - d.clientLeft;
        scope.screen.top = box.top + window.pageYOffset - d.clientTop;
        scope.screen.width = box.width;
        scope.screen.height = box.height;
      };

      const getMouseOnScreen = (function () {
        const vector = new THREE.Vector2();
        return function getMouseOnScreen(pageX, pageY) {
          vector.set(
            (pageX - scope.screen.left) / scope.screen.width,
            (pageY - scope.screen.top) / scope.screen.height
          );
          return vector;
        };
      })();

      const getMouseOnCircle = (function () {
        const vector = new THREE.Vector2();
        return function getMouseOnCircle(pageX, pageY) {
          vector.set(
            (pageX - scope.screen.width * 0.5 - scope.screen.left) /
              (scope.screen.width * 0.5),
            (scope.screen.height + 2 * (scope.screen.top - pageY)) /
              scope.screen.width // screen.width intentional
          );
          return vector;
        };
      })();

      this.rotateCamera = (function () {
        const axis = new THREE.Vector3(),
          quaternion = new THREE.Quaternion(),
          eyeDirection = new THREE.Vector3(),
          objectUpDirection = new THREE.Vector3(),
          objectSidewaysDirection = new THREE.Vector3(),
          moveDirection = new THREE.Vector3();
        return function rotateCamera() {
          moveDirection.set(
            _moveCurr.x - _movePrev.x,
            _moveCurr.y - _movePrev.y,
            0
          );
          let angle = moveDirection.length();

          if (angle) {
            _eye.copy(scope.object.position).sub(scope.target);

            eyeDirection.copy(_eye).normalize();
            objectUpDirection.copy(scope.object.up).normalize();
            objectSidewaysDirection
              .crossVectors(objectUpDirection, eyeDirection)
              .normalize();
            objectUpDirection.setLength(_moveCurr.y - _movePrev.y);
            objectSidewaysDirection.setLength(_moveCurr.x - _movePrev.x);
            moveDirection.copy(objectUpDirection.add(objectSidewaysDirection));
            axis.crossVectors(moveDirection, _eye).normalize();
            angle *= scope.rotateSpeed;
            quaternion.setFromAxisAngle(axis, angle);

            _eye.applyQuaternion(quaternion);

            scope.object.up.applyQuaternion(quaternion);

            _lastAxis.copy(axis);

            _lastAngle = angle;
          } else if (!scope.staticMoving && _lastAngle) {
            _lastAngle *= Math.sqrt(1.0 - scope.dynamicDampingFactor);

            _eye.copy(scope.object.position).sub(scope.target);

            quaternion.setFromAxisAngle(_lastAxis, _lastAngle);

            _eye.applyQuaternion(quaternion);

            scope.object.up.applyQuaternion(quaternion);
          }

          _movePrev.copy(_moveCurr);
        };
      })();

      this.zoomCamera = function () {
        let factor;

        if (_state === STATE.TOUCH_ZOOM_PAN) {
          factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
          _touchZoomDistanceStart = _touchZoomDistanceEnd;

          if (scope.object.isPerspectiveCamera) {
            _eye.multiplyScalar(factor);
          } else if (scope.object.isOrthographicCamera) {
            scope.object.zoom *= factor;
            scope.object.updateProjectionMatrix();
          } else {
            console.warn("THREE.TrackballControls: Unsupported camera type");
          }
        } else {
          factor = 1.0 + (_zoomEnd.y - _zoomStart.y) * scope.zoomSpeed;

          if (factor !== 1.0 && factor > 0.0) {
            if (scope.object.isPerspectiveCamera) {
              _eye.multiplyScalar(factor);
            } else if (scope.object.isOrthographicCamera) {
              scope.object.zoom /= factor;
              scope.object.updateProjectionMatrix();
            } else {
              console.warn("THREE.TrackballControls: Unsupported camera type");
            }
          }

          if (scope.staticMoving) {
            _zoomStart.copy(_zoomEnd);
          } else {
            _zoomStart.y +=
              (_zoomEnd.y - _zoomStart.y) * this.dynamicDampingFactor;
          }
        }
      };

      this.panCamera = (function () {
        const mouseChange = new THREE.Vector2(),
          objectUp = new THREE.Vector3(),
          pan = new THREE.Vector3();
        return function panCamera() {
          mouseChange.copy(_panEnd).sub(_panStart);

          if (mouseChange.lengthSq()) {
            if (scope.object.isOrthographicCamera) {
              const scale_x =
                (scope.object.right - scope.object.left) /
                scope.object.zoom /
                scope.domElement.clientWidth;
              const scale_y =
                (scope.object.top - scope.object.bottom) /
                scope.object.zoom /
                scope.domElement.clientWidth;
              mouseChange.x *= scale_x;
              mouseChange.y *= scale_y;
            }

            mouseChange.multiplyScalar(_eye.length() * scope.panSpeed);
            pan.copy(_eye).cross(scope.object.up).setLength(mouseChange.x);
            pan.add(objectUp.copy(scope.object.up).setLength(mouseChange.y));
            scope.object.position.add(pan);
            scope.target.add(pan);

            if (scope.staticMoving) {
              _panStart.copy(_panEnd);
            } else {
              _panStart.add(
                mouseChange
                  .subVectors(_panEnd, _panStart)
                  .multiplyScalar(scope.dynamicDampingFactor)
              );
            }
          }
        };
      })();

      this.checkDistances = function () {
        if (!scope.noZoom || !scope.noPan) {
          if (_eye.lengthSq() > scope.maxDistance * scope.maxDistance) {
            scope.object.position.addVectors(
              scope.target,
              _eye.setLength(scope.maxDistance)
            );

            _zoomStart.copy(_zoomEnd);
          }

          if (_eye.lengthSq() < scope.minDistance * scope.minDistance) {
            scope.object.position.addVectors(
              scope.target,
              _eye.setLength(scope.minDistance)
            );

            _zoomStart.copy(_zoomEnd);
          }
        }
      };

      this.update = function () {
        _eye.subVectors(scope.object.position, scope.target);

        if (!scope.noRotate) {
          scope.rotateCamera();
        }

        if (!scope.noZoom) {
          scope.zoomCamera();
        }

        if (!scope.noPan) {
          scope.panCamera();
        }

        scope.object.position.addVectors(scope.target, _eye);

        if (scope.object.isPerspectiveCamera) {
          scope.checkDistances();
          scope.object.lookAt(scope.target);

          if (lastPosition.distanceToSquared(scope.object.position) > EPS) {
            scope.dispatchEvent(_changeEvent);
            lastPosition.copy(scope.object.position);
          }
        } else if (scope.object.isOrthographicCamera) {
          scope.object.lookAt(scope.target);

          if (
            lastPosition.distanceToSquared(scope.object.position) > EPS ||
            lastZoom !== scope.object.zoom
          ) {
            scope.dispatchEvent(_changeEvent);
            lastPosition.copy(scope.object.position);
            lastZoom = scope.object.zoom;
          }
        } else {
          console.warn("THREE.TrackballControls: Unsupported camera type");
        }
      };

      this.reset = function () {
        _state = STATE.NONE;
        _keyState = STATE.NONE;
        scope.target.copy(scope.target0);
        scope.object.position.copy(scope.position0);
        scope.object.up.copy(scope.up0);
        scope.object.zoom = scope.zoom0;
        scope.object.updateProjectionMatrix();

        _eye.subVectors(scope.object.position, scope.target);

        scope.object.lookAt(scope.target);
        scope.dispatchEvent(_changeEvent);
        lastPosition.copy(scope.object.position);
        lastZoom = scope.object.zoom;
      }; // listeners

      function onPointerDown(event) {
        if (scope.enabled === false) return;

        if (_pointers.length === 0) {
          scope.domElement.setPointerCapture(event.pointerId);
          scope.domElement.addEventListener("pointermove", onPointerMove);
          scope.domElement.addEventListener("pointerup", onPointerUp);
        } //

        addPointer(event);

        if (event.pointerType === "touch") {
          onTouchStart(event);
        } else {
          onMouseDown(event);
        }
      }

      function onPointerMove(event) {
        if (scope.enabled === false) return;

        if (event.pointerType === "touch") {
          onTouchMove(event);
        } else {
          onMouseMove(event);
        }
      }

      function onPointerUp(event) {
        if (scope.enabled === false) return;

        if (event.pointerType === "touch") {
          onTouchEnd(event);
        } else {
          onMouseUp();
        } //

        removePointer(event);

        if (_pointers.length === 0) {
          scope.domElement.releasePointerCapture(event.pointerId);
          scope.domElement.removeEventListener("pointermove", onPointerMove);
          scope.domElement.removeEventListener("pointerup", onPointerUp);
        }
      }

      function onPointerCancel(event) {
        removePointer(event);
      }

      function keydown(event) {
        if (scope.enabled === false) return;
        window.removeEventListener("keydown", keydown);

        if (_keyState !== STATE.NONE) {
          return;
        } else if (event.code === scope.keys[STATE.ROTATE] && !scope.noRotate) {
          _keyState = STATE.ROTATE;
        } else if (event.code === scope.keys[STATE.ZOOM] && !scope.noZoom) {
          _keyState = STATE.ZOOM;
        } else if (event.code === scope.keys[STATE.PAN] && !scope.noPan) {
          _keyState = STATE.PAN;
        }
      }

      function keyup() {
        if (scope.enabled === false) return;
        _keyState = STATE.NONE;
        window.addEventListener("keydown", keydown);
      }

      function onMouseDown(event) {
        if (_state === STATE.NONE) {
          switch (event.button) {
            case scope.mouseButtons.LEFT:
              _state = STATE.ROTATE;
              break;

            case scope.mouseButtons.MIDDLE:
              _state = STATE.ZOOM;
              break;

            case scope.mouseButtons.RIGHT:
              _state = STATE.PAN;
              break;

            default:
              _state = STATE.NONE;
          }
        }

        const state = _keyState !== STATE.NONE ? _keyState : _state;

        if (state === STATE.ROTATE && !scope.noRotate) {
          _moveCurr.copy(getMouseOnCircle(event.pageX, event.pageY));

          _movePrev.copy(_moveCurr);
        } else if (state === STATE.ZOOM && !scope.noZoom) {
          _zoomStart.copy(getMouseOnScreen(event.pageX, event.pageY));

          _zoomEnd.copy(_zoomStart);
        } else if (state === STATE.PAN && !scope.noPan) {
          _panStart.copy(getMouseOnScreen(event.pageX, event.pageY));

          _panEnd.copy(_panStart);
        }

        scope.dispatchEvent(_startEvent);
      }

      function onMouseMove(event) {
        const state = _keyState !== STATE.NONE ? _keyState : _state;

        if (state === STATE.ROTATE && !scope.noRotate) {
          _movePrev.copy(_moveCurr);

          _moveCurr.copy(getMouseOnCircle(event.pageX, event.pageY));
        } else if (state === STATE.ZOOM && !scope.noZoom) {
          _zoomEnd.copy(getMouseOnScreen(event.pageX, event.pageY));
        } else if (state === STATE.PAN && !scope.noPan) {
          _panEnd.copy(getMouseOnScreen(event.pageX, event.pageY));
        }
      }

      function onMouseUp() {
        _state = STATE.NONE;
        scope.dispatchEvent(_endEvent);
      }

      function onMouseWheel(event) {
        if (scope.enabled === false) return;
        if (scope.noZoom === true) return;
        event.preventDefault();

        switch (event.deltaMode) {
          case 2:
            // Zoom in pages
            _zoomStart.y -= event.deltaY * 0.025;
            break;

          case 1:
            // Zoom in lines
            _zoomStart.y -= event.deltaY * 0.01;
            break;

          default:
            // undefined, 0, assume pixels
            _zoomStart.y -= event.deltaY * 0.00025;
            break;
        }

        scope.dispatchEvent(_startEvent);
        scope.dispatchEvent(_endEvent);
      }

      function onTouchStart(event) {
        trackPointer(event);

        switch (_pointers.length) {
          case 1:
            _state = STATE.TOUCH_ROTATE;

            _moveCurr.copy(
              getMouseOnCircle(_pointers[0].pageX, _pointers[0].pageY)
            );

            _movePrev.copy(_moveCurr);

            break;

          default:
            // 2 or more
            _state = STATE.TOUCH_ZOOM_PAN;
            const dx = _pointers[0].pageX - _pointers[1].pageX;
            const dy = _pointers[0].pageY - _pointers[1].pageY;
            _touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt(
              dx * dx + dy * dy
            );
            const x = (_pointers[0].pageX + _pointers[1].pageX) / 2;
            const y = (_pointers[0].pageY + _pointers[1].pageY) / 2;

            _panStart.copy(getMouseOnScreen(x, y));

            _panEnd.copy(_panStart);

            break;
        }

        scope.dispatchEvent(_startEvent);
      }

      function onTouchMove(event) {
        trackPointer(event);

        switch (_pointers.length) {
          case 1:
            _movePrev.copy(_moveCurr);

            _moveCurr.copy(getMouseOnCircle(event.pageX, event.pageY));

            break;

          default:
            // 2 or more
            const position = getSecondPointerPosition(event);
            const dx = event.pageX - position.x;
            const dy = event.pageY - position.y;
            _touchZoomDistanceEnd = Math.sqrt(dx * dx + dy * dy);
            const x = (event.pageX + position.x) / 2;
            const y = (event.pageY + position.y) / 2;

            _panEnd.copy(getMouseOnScreen(x, y));

            break;
        }
      }

      function onTouchEnd(event) {
        switch (_pointers.length) {
          case 0:
            _state = STATE.NONE;
            break;

          case 1:
            _state = STATE.TOUCH_ROTATE;

            _moveCurr.copy(getMouseOnCircle(event.pageX, event.pageY));

            _movePrev.copy(_moveCurr);

            break;

          case 2:
            _state = STATE.TOUCH_ZOOM_PAN;

            _moveCurr.copy(
              getMouseOnCircle(
                event.pageX - _movePrev.pageX,
                event.pageY - _movePrev.pageY
              )
            );

            _movePrev.copy(_moveCurr);

            break;
        }

        scope.dispatchEvent(_endEvent);
      }

      function contextmenu(event) {
        if (scope.enabled === false) return;
        event.preventDefault();
      }

      function addPointer(event) {
        _pointers.push(event);
      }

      function removePointer(event) {
        delete _pointerPositions[event.pointerId];

        for (let i = 0; i < _pointers.length; i++) {
          if (_pointers[i].pointerId == event.pointerId) {
            _pointers.splice(i, 1);

            return;
          }
        }
      }

      function trackPointer(event) {
        let position = _pointerPositions[event.pointerId];

        if (position === undefined) {
          position = new THREE.Vector2();
          _pointerPositions[event.pointerId] = position;
        }

        position.set(event.pageX, event.pageY);
      }

      function getSecondPointerPosition(event) {
        const pointer =
          event.pointerId === _pointers[0].pointerId
            ? _pointers[1]
            : _pointers[0];
        return _pointerPositions[pointer.pointerId];
      }

      this.dispose = function () {
        scope.domElement.removeEventListener("contextmenu", contextmenu);
        scope.domElement.removeEventListener("pointerdown", onPointerDown);
        scope.domElement.removeEventListener("pointercancel", onPointerCancel);
        scope.domElement.removeEventListener("wheel", onMouseWheel);
        scope.domElement.removeEventListener("pointermove", onPointerMove);
        scope.domElement.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("keydown", keydown);
        window.removeEventListener("keyup", keyup);
      };

      this.domElement.addEventListener("contextmenu", contextmenu);
      this.domElement.addEventListener("pointerdown", onPointerDown);
      this.domElement.addEventListener("pointercancel", onPointerCancel);
      this.domElement.addEventListener("wheel", onMouseWheel, {
        passive: false,
      });
      window.addEventListener("keydown", keydown);
      window.addEventListener("keyup", keyup);
      this.handleResize(); // force an update at start

      this.update();
    }
  }

  THREE.TrackballControls = TrackballControls;
})();

// postprocessing/EffectComposer
(function () {
  class EffectComposer {
    constructor(renderer, renderTarget) {
      this.renderer = renderer;
      if (renderTarget === undefined) {
        const size = renderer.getSize(new THREE.Vector2());
        this._pixelRatio = renderer.getPixelRatio();
        this._width = size.width;
        this._height = size.height;
        renderTarget = new THREE.WebGLRenderTarget(
          this._width * this._pixelRatio,
          this._height * this._pixelRatio
        );
        renderTarget.texture.name = "EffectComposer.rt1";
      } else {
        this._pixelRatio = 1;
        this._width = renderTarget.width;
        this._height = renderTarget.height;
      }

      this.renderTarget1 = renderTarget;
      this.renderTarget2 = renderTarget.clone();
      this.renderTarget2.texture.name = "EffectComposer.rt2";
      this.writeBuffer = this.renderTarget1;
      this.readBuffer = this.renderTarget2;
      this.renderToScreen = true;
      this.passes = [];

      // dependencies

      if (THREE.CopyShader === undefined) {
        console.error("THREE.EffectComposer relies on THREE.CopyShader");
      }

      if (THREE.ShaderPass === undefined) {
        console.error("THREE.EffectComposer relies on THREE.ShaderPass");
      }

      this.copyPass = new THREE.ShaderPass(THREE.CopyShader);
      this.clock = new THREE.Clock();
    }
    swapBuffers() {
      const tmp = this.readBuffer;
      this.readBuffer = this.writeBuffer;
      this.writeBuffer = tmp;
    }
    addPass(pass) {
      this.passes.push(pass);
      pass.setSize(
        this._width * this._pixelRatio,
        this._height * this._pixelRatio
      );
    }
    insertPass(pass, index) {
      this.passes.splice(index, 0, pass);
      pass.setSize(
        this._width * this._pixelRatio,
        this._height * this._pixelRatio
      );
    }
    removePass(pass) {
      const index = this.passes.indexOf(pass);
      if (index !== -1) {
        this.passes.splice(index, 1);
      }
    }
    isLastEnabledPass(passIndex) {
      for (let i = passIndex + 1; i < this.passes.length; i++) {
        if (this.passes[i].enabled) {
          return false;
        }
      }

      return true;
    }
    render(deltaTime) {
      // deltaTime value is in seconds

      if (deltaTime === undefined) {
        deltaTime = this.clock.getDelta();
      }

      const currentRenderTarget = this.renderer.getRenderTarget();
      let maskActive = false;
      for (let i = 0, il = this.passes.length; i < il; i++) {
        const pass = this.passes[i];
        if (pass.enabled === false) continue;
        pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i);
        pass.render(
          this.renderer,
          this.writeBuffer,
          this.readBuffer,
          deltaTime,
          maskActive
        );
        if (pass.needsSwap) {
          if (maskActive) {
            const context = this.renderer.getContext();
            const stencil = this.renderer.state.buffers.stencil;

            //context.stencilFunc( context.NOTEQUAL, 1, 0xffffffff );
            stencil.setFunc(context.NOTEQUAL, 1, 0xffffffff);
            this.copyPass.render(
              this.renderer,
              this.writeBuffer,
              this.readBuffer,
              deltaTime
            );

            //context.stencilFunc( context.EQUAL, 1, 0xffffffff );
            stencil.setFunc(context.EQUAL, 1, 0xffffffff);
          }

          this.swapBuffers();
        }

        if (THREE.MaskPass !== undefined) {
          if (pass instanceof THREE.MaskPass) {
            maskActive = true;
          } else if (pass instanceof THREE.ClearMaskPass) {
            maskActive = false;
          }
        }
      }

      this.renderer.setRenderTarget(currentRenderTarget);
    }
    reset(renderTarget) {
      if (renderTarget === undefined) {
        const size = this.renderer.getSize(new THREE.Vector2());
        this._pixelRatio = this.renderer.getPixelRatio();
        this._width = size.width;
        this._height = size.height;
        renderTarget = this.renderTarget1.clone();
        renderTarget.setSize(
          this._width * this._pixelRatio,
          this._height * this._pixelRatio
        );
      }

      this.renderTarget1.dispose();
      this.renderTarget2.dispose();
      this.renderTarget1 = renderTarget;
      this.renderTarget2 = renderTarget.clone();
      this.writeBuffer = this.renderTarget1;
      this.readBuffer = this.renderTarget2;
    }
    setSize(width, height) {
      this._width = width;
      this._height = height;
      const effectiveWidth = this._width * this._pixelRatio;
      const effectiveHeight = this._height * this._pixelRatio;
      this.renderTarget1.setSize(effectiveWidth, effectiveHeight);
      this.renderTarget2.setSize(effectiveWidth, effectiveHeight);
      for (let i = 0; i < this.passes.length; i++) {
        this.passes[i].setSize(effectiveWidth, effectiveHeight);
      }
    }
    setPixelRatio(pixelRatio) {
      this._pixelRatio = pixelRatio;
      this.setSize(this._width, this._height);
    }
    dispose() {
      this.renderTarget1.dispose();
      this.renderTarget2.dispose();
      this.copyPass.dispose();
    }
  }
  class Pass {
    constructor() {
      // if set to true, the pass is processed by the composer
      this.enabled = true;

      // if set to true, the pass indicates to swap read and write buffer after rendering
      this.needsSwap = true;

      // if set to true, the pass clears its buffer before rendering
      this.clear = false;

      // if set to true, the result of the pass is rendered to screen. This is set automatically by EffectComposer.
      this.renderToScreen = false;
    }
    setSize() {}
    render() {
      console.error(
        "THREE.Pass: .render() must be implemented in derived pass."
      );
    }
  }

  // Helper for passes that need to fill the viewport with a single quad.

  const _camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // https://github.com/mrdoob/three.js/pull/21358

  const _geometry = new THREE.BufferGeometry();
  _geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3)
  );
  _geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2)
  );
  class FullScreenQuad {
    constructor(material) {
      this._mesh = new THREE.Mesh(_geometry, material);
    }
    dispose() {
      this._mesh.geometry.dispose();
    }
    render(renderer) {
      renderer.render(this._mesh, _camera);
    }
    get material() {
      return this._mesh.material;
    }
    set material(value) {
      this._mesh.material = value;
    }
  }

  THREE.EffectComposer = EffectComposer;
  THREE.FullScreenQuad = FullScreenQuad;
  THREE.Pass = Pass;
})();

// postprocessing/ShaderPass
(function () {
  class ShaderPass extends THREE.Pass {
    constructor(shader, textureID) {
      super();
      this.textureID = textureID !== undefined ? textureID : "tDiffuse";
      if (shader instanceof THREE.ShaderMaterial) {
        this.uniforms = shader.uniforms;
        this.material = shader;
      } else if (shader) {
        this.uniforms = THREE.UniformsUtils.clone(shader.uniforms);
        this.material = new THREE.ShaderMaterial({
          defines: Object.assign({}, shader.defines),
          uniforms: this.uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader,
        });
      }

      this.fsQuad = new THREE.FullScreenQuad(this.material);
    }
    render(renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */) {
      if (this.uniforms[this.textureID]) {
        this.uniforms[this.textureID].value = readBuffer.texture;
      }

      this.fsQuad.material = this.material;
      if (this.renderToScreen) {
        renderer.setRenderTarget(null);
        this.fsQuad.render(renderer);
      } else {
        renderer.setRenderTarget(writeBuffer);
        // TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
        if (this.clear)
          renderer.clear(
            renderer.autoClearColor,
            renderer.autoClearDepth,
            renderer.autoClearStencil
          );
        this.fsQuad.render(renderer);
      }
    }
    dispose() {
      this.material.dispose();
      this.fsQuad.dispose();
    }
  }

  THREE.ShaderPass = ShaderPass;
})();

// postprocessing/UnrealBloomPass
(function () {
  class UnrealBloomPass extends THREE.Pass {
    constructor(resolution, strength, radius, threshold) {
      super();
      this.strength = strength !== undefined ? strength : 1;
      this.radius = radius;
      this.threshold = threshold;
      this.resolution =
        resolution !== undefined
          ? new THREE.Vector2(resolution.x, resolution.y)
          : new THREE.Vector2(256, 256);

      // create color only once here, reuse it later inside the render function
      this.clearColor = new THREE.Color(0, 0, 0);

      // render targets
      this.renderTargetsHorizontal = [];
      this.renderTargetsVertical = [];
      this.nMips = 5;
      let resx = Math.round(this.resolution.x / 2);
      let resy = Math.round(this.resolution.y / 2);
      this.renderTargetBright = new THREE.WebGLRenderTarget(resx, resy);
      this.renderTargetBright.texture.name = "UnrealBloomPass.bright";
      this.renderTargetBright.texture.generateMipmaps = false;
      for (let i = 0; i < this.nMips; i++) {
        const renderTargetHorizonal = new THREE.WebGLRenderTarget(resx, resy);
        renderTargetHorizonal.texture.name = "UnrealBloomPass.h" + i;
        renderTargetHorizonal.texture.generateMipmaps = false;
        this.renderTargetsHorizontal.push(renderTargetHorizonal);
        const renderTargetVertical = new THREE.WebGLRenderTarget(resx, resy);
        renderTargetVertical.texture.name = "UnrealBloomPass.v" + i;
        renderTargetVertical.texture.generateMipmaps = false;
        this.renderTargetsVertical.push(renderTargetVertical);
        resx = Math.round(resx / 2);
        resy = Math.round(resy / 2);
      }

      // luminosity high pass material

      if (THREE.LuminosityHighPassShader === undefined)
        console.error(
          "THREE.UnrealBloomPass relies on THREE.LuminosityHighPassShader"
        );
      const highPassShader = THREE.LuminosityHighPassShader;
      this.highPassUniforms = THREE.UniformsUtils.clone(
        highPassShader.uniforms
      );
      this.highPassUniforms["luminosityThreshold"].value = threshold;
      this.highPassUniforms["smoothWidth"].value = 0.01;
      this.materialHighPassFilter = new THREE.ShaderMaterial({
        uniforms: this.highPassUniforms,
        vertexShader: highPassShader.vertexShader,
        fragmentShader: highPassShader.fragmentShader,
        defines: {},
      });

      // Gaussian Blur Materials
      this.separableBlurMaterials = [];
      const kernelSizeArray = [3, 5, 7, 9, 11];
      resx = Math.round(this.resolution.x / 2);
      resy = Math.round(this.resolution.y / 2);
      for (let i = 0; i < this.nMips; i++) {
        this.separableBlurMaterials.push(
          this.getSeperableBlurMaterial(kernelSizeArray[i])
        );
        this.separableBlurMaterials[i].uniforms["texSize"].value =
          new THREE.Vector2(resx, resy);
        resx = Math.round(resx / 2);
        resy = Math.round(resy / 2);
      }

      // Composite material
      this.compositeMaterial = this.getCompositeMaterial(this.nMips);
      this.compositeMaterial.uniforms["blurTexture1"].value =
        this.renderTargetsVertical[0].texture;
      this.compositeMaterial.uniforms["blurTexture2"].value =
        this.renderTargetsVertical[1].texture;
      this.compositeMaterial.uniforms["blurTexture3"].value =
        this.renderTargetsVertical[2].texture;
      this.compositeMaterial.uniforms["blurTexture4"].value =
        this.renderTargetsVertical[3].texture;
      this.compositeMaterial.uniforms["blurTexture5"].value =
        this.renderTargetsVertical[4].texture;
      this.compositeMaterial.uniforms["bloomStrength"].value = strength;
      this.compositeMaterial.uniforms["bloomRadius"].value = 0.1;
      this.compositeMaterial.needsUpdate = true;
      const bloomFactors = [1.0, 0.8, 0.6, 0.4, 0.2];
      this.compositeMaterial.uniforms["bloomFactors"].value = bloomFactors;
      this.bloomTintColors = [
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(1, 1, 1),
        new THREE.Vector3(1, 1, 1),
      ];
      this.compositeMaterial.uniforms["bloomTintColors"].value =
        this.bloomTintColors;

      // copy material
      if (THREE.CopyShader === undefined) {
        console.error("THREE.UnrealBloomPass relies on THREE.CopyShader");
      }

      const copyShader = THREE.CopyShader;
      this.copyUniforms = THREE.UniformsUtils.clone(copyShader.uniforms);
      this.copyUniforms["opacity"].value = 1.0;
      this.materialCopy = new THREE.ShaderMaterial({
        uniforms: this.copyUniforms,
        vertexShader: copyShader.vertexShader,
        fragmentShader: copyShader.fragmentShader,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      });
      this.enabled = true;
      this.needsSwap = false;
      this._oldClearColor = new THREE.Color();
      this.oldClearAlpha = 1;
      this.basic = new THREE.MeshBasicMaterial();
      this.fsQuad = new THREE.FullScreenQuad(null);
    }
    dispose() {
      for (let i = 0; i < this.renderTargetsHorizontal.length; i++) {
        this.renderTargetsHorizontal[i].dispose();
      }

      for (let i = 0; i < this.renderTargetsVertical.length; i++) {
        this.renderTargetsVertical[i].dispose();
      }

      this.renderTargetBright.dispose();

      //

      for (let i = 0; i < this.separableBlurMaterials.length; i++) {
        this.separableBlurMaterials[i].dispose();
      }

      this.compositeMaterial.dispose();
      this.materialCopy.dispose();
      this.basic.dispose();

      //

      this.fsQuad.dispose();
    }
    setSize(width, height) {
      let resx = Math.round(width / 2);
      let resy = Math.round(height / 2);
      this.renderTargetBright.setSize(resx, resy);
      for (let i = 0; i < this.nMips; i++) {
        this.renderTargetsHorizontal[i].setSize(resx, resy);
        this.renderTargetsVertical[i].setSize(resx, resy);
        this.separableBlurMaterials[i].uniforms["texSize"].value =
          new THREE.Vector2(resx, resy);
        resx = Math.round(resx / 2);
        resy = Math.round(resy / 2);
      }
    }
    render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
      renderer.getClearColor(this._oldClearColor);
      this.oldClearAlpha = renderer.getClearAlpha();
      const oldAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setClearColor(this.clearColor, 0);
      if (maskActive) renderer.state.buffers.stencil.setTest(false);

      // Render input to screen

      if (this.renderToScreen) {
        this.fsQuad.material = this.basic;
        this.basic.map = readBuffer.texture;
        renderer.setRenderTarget(null);
        renderer.clear();
        this.fsQuad.render(renderer);
      }

      // 1. Extract Bright Areas

      this.highPassUniforms["tDiffuse"].value = readBuffer.texture;
      this.highPassUniforms["luminosityThreshold"].value = this.threshold;
      this.fsQuad.material = this.materialHighPassFilter;
      renderer.setRenderTarget(this.renderTargetBright);
      renderer.clear();
      this.fsQuad.render(renderer);

      // 2. Blur All the mips progressively

      let inputRenderTarget = this.renderTargetBright;
      for (let i = 0; i < this.nMips; i++) {
        this.fsQuad.material = this.separableBlurMaterials[i];
        this.separableBlurMaterials[i].uniforms["colorTexture"].value =
          inputRenderTarget.texture;
        this.separableBlurMaterials[i].uniforms["direction"].value =
          UnrealBloomPass.BlurDirectionX;
        renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
        renderer.clear();
        this.fsQuad.render(renderer);
        this.separableBlurMaterials[i].uniforms["colorTexture"].value =
          this.renderTargetsHorizontal[i].texture;
        this.separableBlurMaterials[i].uniforms["direction"].value =
          UnrealBloomPass.BlurDirectionY;
        renderer.setRenderTarget(this.renderTargetsVertical[i]);
        renderer.clear();
        this.fsQuad.render(renderer);
        inputRenderTarget = this.renderTargetsVertical[i];
      }

      // Composite All the mips

      this.fsQuad.material = this.compositeMaterial;
      this.compositeMaterial.uniforms["bloomStrength"].value = this.strength;
      this.compositeMaterial.uniforms["bloomRadius"].value = this.radius;
      this.compositeMaterial.uniforms["bloomTintColors"].value =
        this.bloomTintColors;
      renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
      renderer.clear();
      this.fsQuad.render(renderer);

      // Blend it additively over the input texture

      this.fsQuad.material = this.materialCopy;
      this.copyUniforms["tDiffuse"].value =
        this.renderTargetsHorizontal[0].texture;
      if (maskActive) renderer.state.buffers.stencil.setTest(true);
      if (this.renderToScreen) {
        renderer.setRenderTarget(null);
        this.fsQuad.render(renderer);
      } else {
        renderer.setRenderTarget(readBuffer);
        this.fsQuad.render(renderer);
      }

      // Restore renderer settings

      renderer.setClearColor(this._oldClearColor, this.oldClearAlpha);
      renderer.autoClear = oldAutoClear;
    }
    getSeperableBlurMaterial(kernelRadius) {
      return new THREE.ShaderMaterial({
        defines: {
          KERNEL_RADIUS: kernelRadius,
          SIGMA: kernelRadius,
        },
        uniforms: {
          colorTexture: {
            value: null,
          },
          texSize: {
            value: new THREE.Vector2(0.5, 0.5),
          },
          direction: {
            value: new THREE.Vector2(0.5, 0.5),
          },
        },
        vertexShader: `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
        fragmentShader: `#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 texSize;
				uniform vec2 direction;

				float gaussianPdf(in float x, in float sigma) {
					return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
				}
				void main() {
					vec2 invSize = 1.0 / texSize;
					float fSigma = float(SIGMA);
					float weightSum = gaussianPdf(0.0, fSigma);
					vec3 diffuseSum = texture2D( colorTexture, vUv).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianPdf(x, fSigma);
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`,
      });
    }
    getCompositeMaterial(nMips) {
      return new THREE.ShaderMaterial({
        defines: {
          NUM_MIPS: nMips,
        },
        uniforms: {
          blurTexture1: {
            value: null,
          },
          blurTexture2: {
            value: null,
          },
          blurTexture3: {
            value: null,
          },
          blurTexture4: {
            value: null,
          },
          blurTexture5: {
            value: null,
          },
          bloomStrength: {
            value: 1.0,
          },
          bloomFactors: {
            value: null,
          },
          bloomTintColors: {
            value: null,
          },
          bloomRadius: {
            value: 0.0,
          },
        },
        vertexShader: `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
        fragmentShader: `varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`,
      });
    }
  }
  UnrealBloomPass.BlurDirectionX = new THREE.Vector2(1.0, 0.0);
  UnrealBloomPass.BlurDirectionY = new THREE.Vector2(0.0, 1.0);

  THREE.UnrealBloomPass = UnrealBloomPass;
})();

// postprocessing/RenderPass
(function () {
  class RenderPass extends THREE.Pass {
    constructor(scene, camera, overrideMaterial, clearColor, clearAlpha) {
      super();
      this.scene = scene;
      this.camera = camera;
      this.overrideMaterial = overrideMaterial;
      this.clearColor = clearColor;
      this.clearAlpha = clearAlpha !== undefined ? clearAlpha : 0;
      this.clear = true;
      this.clearDepth = false;
      this.needsSwap = false;
      this._oldClearColor = new THREE.Color();
    }
    render(renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */) {
      const oldAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      let oldClearAlpha, oldOverrideMaterial;
      if (this.overrideMaterial !== undefined) {
        oldOverrideMaterial = this.scene.overrideMaterial;
        this.scene.overrideMaterial = this.overrideMaterial;
      }

      if (this.clearColor) {
        renderer.getClearColor(this._oldClearColor);
        oldClearAlpha = renderer.getClearAlpha();
        renderer.setClearColor(this.clearColor, this.clearAlpha);
      }

      if (this.clearDepth) {
        renderer.clearDepth();
      }

      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);

      // TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
      if (this.clear)
        renderer.clear(
          renderer.autoClearColor,
          renderer.autoClearDepth,
          renderer.autoClearStencil
        );
      renderer.render(this.scene, this.camera);
      if (this.clearColor) {
        renderer.setClearColor(this._oldClearColor, oldClearAlpha);
      }

      if (this.overrideMaterial !== undefined) {
        this.scene.overrideMaterial = oldOverrideMaterial;
      }

      renderer.autoClear = oldAutoClear;
    }
  }

  THREE.RenderPass = RenderPass;
})();

// shaders/LuminosityHighPassShader
(function () {
  const LuminosityHighPassShader = {
    shaderID: "luminosityHighPass",
    uniforms: {
      tDiffuse: {
        value: null,
      },
      luminosityThreshold: {
        value: 1.0,
      },
      smoothWidth: {
        value: 1.0,
      },
      defaultColor: {
        value: new THREE.Color(0x000000),
      },
      defaultOpacity: {
        value: 0.0,
      },
    },
    vertexShader: /* glsl */ `

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,
    fragmentShader: /* glsl */ `

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			vec3 luma = vec3( 0.299, 0.587, 0.114 );

			float v = dot( texel.xyz, luma );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`,
  };

  THREE.LuminosityHighPassShader = LuminosityHighPassShader;
})();

// shaders/CopyShader
(function () {
  /**
   * Full-screen textured quad shader
   */

  const CopyShader = {
    uniforms: {
      tDiffuse: {
        value: null,
      },
      opacity: {
        value: 1.0,
      },
    },
    vertexShader: /* glsl */ `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,
    fragmentShader: /* glsl */ `

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );
			gl_FragColor.a *= opacity;


		}`,
  };

  THREE.CopyShader = CopyShader;
})();

// objects/Reflector
(function () {
  class Reflector extends THREE.Mesh {
    constructor(geometry, options = {}) {
      super(geometry);
      this.isReflector = true;
      this.type = "Reflector";
      this.camera = new THREE.PerspectiveCamera();
      const scope = this;
      const color =
        options.color !== undefined
          ? new THREE.Color(options.color)
          : new THREE.Color(0x7f7f7f);
      const textureWidth = options.textureWidth || 512;
      const textureHeight = options.textureHeight || 512;
      const clipBias = options.clipBias || 0;
      const shader = options.shader || Reflector.ReflectorShader;
      const multisample =
        options.multisample !== undefined ? options.multisample : 4;

      //

      const reflectorPlane = new THREE.Plane();
      const normal = new THREE.Vector3();
      const reflectorWorldPosition = new THREE.Vector3();
      const cameraWorldPosition = new THREE.Vector3();
      const rotationMatrix = new THREE.Matrix4();
      const lookAtPosition = new THREE.Vector3(0, 0, -1);
      const clipPlane = new THREE.Vector4();
      const view = new THREE.Vector3();
      const target = new THREE.Vector3();
      const q = new THREE.Vector4();
      const textureMatrix = new THREE.Matrix4();
      const virtualCamera = this.camera;
      const renderTarget = new THREE.WebGLRenderTarget(
        textureWidth,
        textureHeight,
        {
          samples: multisample,
          type: THREE.HalfFloatType,
        }
      );
      const material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(shader.uniforms),
        fragmentShader: shader.fragmentShader,
        vertexShader: shader.vertexShader,
      });
      material.uniforms["tDiffuse"].value = renderTarget.texture;
      material.uniforms["color"].value = color;
      material.uniforms["textureMatrix"].value = textureMatrix;
      this.material = material;
      this.onBeforeRender = function (renderer, scene, camera) {
        reflectorWorldPosition.setFromMatrixPosition(scope.matrixWorld);
        cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
        rotationMatrix.extractRotation(scope.matrixWorld);
        normal.set(0, 0, 1);
        normal.applyMatrix4(rotationMatrix);
        view.subVectors(reflectorWorldPosition, cameraWorldPosition);

        // Avoid rendering when reflector is facing away

        if (view.dot(normal) > 0) return;
        view.reflect(normal).negate();
        view.add(reflectorWorldPosition);
        rotationMatrix.extractRotation(camera.matrixWorld);
        lookAtPosition.set(0, 0, -1);
        lookAtPosition.applyMatrix4(rotationMatrix);
        lookAtPosition.add(cameraWorldPosition);
        target.subVectors(reflectorWorldPosition, lookAtPosition);
        target.reflect(normal).negate();
        target.add(reflectorWorldPosition);
        virtualCamera.position.copy(view);
        virtualCamera.up.set(0, 1, 0);
        virtualCamera.up.applyMatrix4(rotationMatrix);
        virtualCamera.up.reflect(normal);
        virtualCamera.lookAt(target);
        virtualCamera.far = camera.far; // Used in WebGLBackground

        virtualCamera.updateMatrixWorld();
        virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

        // Update the texture matrix
        textureMatrix.set(
          0.5,
          0.0,
          0.0,
          0.5,
          0.0,
          0.5,
          0.0,
          0.5,
          0.0,
          0.0,
          0.5,
          0.5,
          0.0,
          0.0,
          0.0,
          1.0
        );
        textureMatrix.multiply(virtualCamera.projectionMatrix);
        textureMatrix.multiply(virtualCamera.matrixWorldInverse);
        textureMatrix.multiply(scope.matrixWorld);

        // Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
        // Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
        reflectorPlane.setFromNormalAndCoplanarPoint(
          normal,
          reflectorWorldPosition
        );
        reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
        clipPlane.set(
          reflectorPlane.normal.x,
          reflectorPlane.normal.y,
          reflectorPlane.normal.z,
          reflectorPlane.constant
        );
        const projectionMatrix = virtualCamera.projectionMatrix;
        q.x =
          (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) /
          projectionMatrix.elements[0];
        q.y =
          (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) /
          projectionMatrix.elements[5];
        q.z = -1.0;
        q.w =
          (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

        // Calculate the scaled plane vector
        clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));

        // Replacing the third row of the projection matrix
        projectionMatrix.elements[2] = clipPlane.x;
        projectionMatrix.elements[6] = clipPlane.y;
        projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
        projectionMatrix.elements[14] = clipPlane.w;

        // Render
        scope.visible = false;
        const currentRenderTarget = renderer.getRenderTarget();
        const currentXrEnabled = renderer.xr.enabled;
        const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
        const currentOutputEncoding = renderer.outputEncoding;
        const currentToneMapping = renderer.toneMapping;
        renderer.xr.enabled = false; // Avoid camera modification
        renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows
        renderer.outputEncoding = THREE.LinearEncoding;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.setRenderTarget(renderTarget);
        renderer.state.buffers.depth.setMask(true); // make sure the depth buffer is writable so it can be properly cleared, see #18897

        if (renderer.autoClear === false) renderer.clear();
        renderer.render(scene, virtualCamera);
        renderer.xr.enabled = currentXrEnabled;
        renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
        renderer.outputEncoding = currentOutputEncoding;
        renderer.toneMapping = currentToneMapping;
        renderer.setRenderTarget(currentRenderTarget);

        // Restore viewport

        const viewport = camera.viewport;
        if (viewport !== undefined) {
          renderer.state.viewport(viewport);
        }

        scope.visible = true;
      };

      this.getRenderTarget = function () {
        return renderTarget;
      };

      this.dispose = function () {
        renderTarget.dispose();
        scope.material.dispose();
      };
    }
  }
  Reflector.ReflectorShader = {
    uniforms: {
      color: {
        value: null,
      },
      tDiffuse: {
        value: null,
      },
      textureMatrix: {
        value: null,
      },
    },
    vertexShader: /* glsl */ `
		uniform mat4 textureMatrix;
		varying vec4 vUv;

		#include <common>
		#include <logdepthbuf_pars_vertex>

		void main() {

			vUv = textureMatrix * vec4( position, 1.0 );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

			#include <logdepthbuf_vertex>

		}`,
    fragmentShader: /* glsl */ `
		uniform vec3 color;
		uniform sampler2D tDiffuse;
		varying vec4 vUv;

		#include <logdepthbuf_pars_fragment>

		float blendOverlay( float base, float blend ) {

			return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );

		}

		vec3 blendOverlay( vec3 base, vec3 blend ) {

			return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );

		}

		void main() {

			#include <logdepthbuf_fragment>

			vec4 base = texture2DProj( tDiffuse, vUv );
			gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );

			#include <tonemapping_fragment>
			#include <encodings_fragment>

		}`,
  };

  THREE.Reflector = Reflector;
})();
