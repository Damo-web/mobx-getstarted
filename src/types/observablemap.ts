import {
    $mobx,
    IEnhancer,
    IInterceptable,
    IInterceptor,
    IListenable,
    Lambda,
    ObservableValue,
    checkIfStateModificationsAreAllowed,
    createAtom,
    createInstanceofPredicate,
    deepEnhancer,
    fail,
    getMapLikeKeys,
    getNextId,
    hasInterceptors,
    hasListeners,
    interceptChange,
    invariant,
    isES6Map,
    isPlainObject,
    isSpyEnabled,
    makeIterable,
    notifyListeners,
    referenceEnhancer,
    registerInterceptor,
    registerListener,
    spyReportEnd,
    spyReportStart,
    transaction,
    untracked,
    globalState
} from "../internal"

export interface IKeyValueMap<V = any> {
    [key: string]: V
}

export type IMapEntry<K = any, V = any> = [K, V]
export type IMapEntries<K = any, V = any> = IMapEntry<K, V>[]

export type IMapDidChange<K = any, V = any> =
    | {
          object: ObservableMap<K, V>
          name: K // actual the key or index, but this is based on the ancient .observe proposal for consistency
          type: "update"
          newValue: V
          oldValue: V
      }
    | {
          object: ObservableMap<K, V>
          name: K
          type: "add"
          newValue: V
      }
    | {
          object: ObservableMap<K, V>
          name: K
          type: "delete"
          oldValue: V
      }

export interface IMapWillChange<K = any, V = any> {
    object: ObservableMap<K, V>
    type: "update" | "add" | "delete"
    name: K
    newValue?: V
}

const ObservableMapMarker = {}

export type IObservableMapInitialValues<K = any, V = any> =
    | IMapEntries<K, V>
    | IKeyValueMap<V>
    | Map<K, V>

// just extend Map? See also https://gist.github.com/nestharus/13b4d74f2ef4a2f4357dbd3fc23c1e54
// But: https://github.com/mobxjs/mobx/issues/1556
export class ObservableMap<K = any, V = any>
    implements Map<K, V>, IInterceptable<IMapWillChange<K, V>>, IListenable {
    [$mobx] = ObservableMapMarker
    private _data: Map<K, ObservableValue<V>>
    private _hasMap: Map<K, ObservableValue<boolean>> // hasMap, not hashMap >-).
    private _keysAtom = createAtom(`${this.name}.keys()`)
    interceptors
    changeListeners
    dehancer: any

    constructor(
        initialData?: IObservableMapInitialValues<K, V>,
        public enhancer: IEnhancer<V> = deepEnhancer,
        public name = "ObservableMap@" + getNextId()
    ) {
        if (typeof Map !== "function") {
            throw new Error(
                "mobx.map requires Map polyfill for the current browser. Check babel-polyfill or core-js/es6/map.js"
            )
        }
        this._data = new Map()
        this._hasMap = new Map()
        this.merge(initialData)
    }

    private _has(key: K): boolean {
        return this._data.has(key)
    }

    has(key: K): boolean {
        if (this._hasMap.has(key)) return this._hasMap.get(key)!.get()
        return this._updateHasMapEntry(key, false).get()
    }

    set(key: K, value: V) {
        const hasKey = this._has(key)
        if (hasInterceptors(this)) {
            const change = interceptChange<IMapWillChange<K, V>>(this, {
                type: hasKey ? "update" : "add",
                object: this,
                newValue: value,
                name: key
            })
            if (!change) return this
            value = change.newValue!
        }
        if (hasKey) {
            this._updateValue(key, value)
        } else {
            this._addValue(key, value)
        }
        return this
    }

    delete(key: K): boolean {
        if (hasInterceptors(this)) {
            const change = interceptChange<IMapWillChange<K, V>>(this, {
                type: "delete",
                object: this,
                name: key
            })
            if (!change) return false
        }
        if (this._has(key)) {
            const notifySpy = isSpyEnabled()
            const notify = hasListeners(this)
            const change =
                notify || notifySpy
                    ? <IMapDidChange<K, V>>{
                          type: "delete",
                          object: this,
                          oldValue: (<any>this._data.get(key)).value,
                          name: key
                      }
                    : null

            if (notifySpy && process.env.NODE_ENV !== "production")
                spyReportStart({ ...change, name: this.name, key })
            transaction(() => {
                this._keysAtom.reportChanged()
                this._updateHasMapEntry(key, false)
                const observable = this._data.get(key)!
                observable.setNewValue(undefined as any)
                this._data.delete(key)
            })
            if (notify) notifyListeners(this, change)
            if (notifySpy && process.env.NODE_ENV !== "production") spyReportEnd()
            return true
        }
        return false
    }

    private _updateHasMapEntry(key: K, value: boolean): ObservableValue<boolean> {
        // optimization; don't fill the hasMap if we are not observing, or remove entry if there are no observers anymore
        let entry = this._hasMap.get(key)
        if (entry) {
            entry.setNewValue(value)
        } else {
            entry = new ObservableValue(value, referenceEnhancer, `${this.name}.${key}?`, false)
            this._hasMap.set(key, entry)
        }
        return entry
    }

    private _updateValue(key: K, newValue: V | undefined) {
        const observable = this._data.get(key)!
        newValue = (observable as any).prepareNewValue(newValue) as V
        if (newValue !== globalState.UNCHANGED) {
            const notifySpy = isSpyEnabled()
            const notify = hasListeners(this)
            const change =
                notify || notifySpy
                    ? <IMapDidChange<K, V>>{
                          type: "update",
                          object: this,
                          oldValue: (observable as any).value,
                          name: key,
                          newValue
                      }
                    : null
            if (notifySpy && process.env.NODE_ENV !== "production")
                spyReportStart({ ...change, name: this.name, key })
            observable.setNewValue(newValue as V)
            if (notify) notifyListeners(this, change)
            if (notifySpy && process.env.NODE_ENV !== "production") spyReportEnd()
        }
    }

    private _addValue(key: K, newValue: V) {
        checkIfStateModificationsAreAllowed(this._keysAtom)
        transaction(() => {
            const observable = new ObservableValue(
                newValue,
                this.enhancer,
                `${this.name}.${key}`,
                false
            )
            this._data.set(key, observable)
            newValue = (observable as any).value // value might have been changed
            this._updateHasMapEntry(key, true)
            this._keysAtom.reportChanged()
        })
        const notifySpy = isSpyEnabled()
        const notify = hasListeners(this)
        const change =
            notify || notifySpy
                ? <IMapDidChange<K, V>>{
                      type: "add",
                      object: this,
                      name: key,
                      newValue
                  }
                : null
        if (notifySpy && process.env.NODE_ENV !== "production")
            spyReportStart({ ...change, name: this.name, key })
        if (notify) notifyListeners(this, change)
        if (notifySpy && process.env.NODE_ENV !== "production") spyReportEnd()
    }

    get(key: K): V | undefined {
        if (this.has(key)) return this.dehanceValue(this._data.get(key)!.get())
        return this.dehanceValue(undefined)
    }

    private dehanceValue<X extends V | undefined>(value: X): X {
        if (this.dehancer !== undefined) {
            return this.dehancer(value)
        }
        return value
    }

    keys(): IterableIterator<K> {
        this._keysAtom.reportObserved()
        return this._data.keys()
    }

    values(): IterableIterator<V> {
        const self = this
        let nextIndex = 0
        const keys = Array.from(this.keys())
        return makeIterable<V>({
            next() {
                return nextIndex < keys.length
                    ? { value: self.get(keys[nextIndex++]), done: false }
                    : { done: true }
            }
        } as any)
    }

    entries(): IterableIterator<IMapEntry<K, V>> {
        const self = this
        let nextIndex = 0
        const keys = Array.from(this.keys())
        return makeIterable({
            next: function() {
                if (nextIndex < keys.length) {
                    const key = keys[nextIndex++]
                    return {
                        value: [key, self.get(key)!] as [K, V],
                        done: false
                    }
                }
                return { done: true }
            }
        } as any)
    }

    [Symbol.iterator]() {
        return this.entries()
    }

    forEach(callback: (value: V, key: K, object: Map<K, V>) => void, thisArg?) {
        for (const [key, value] of this) callback.call(thisArg, value, key, this)
    }

    /** Merge another object into this object, returns this. */
    merge(other: ObservableMap<K, V> | IKeyValueMap<V> | any): ObservableMap<K, V> {
        if (isObservableMap(other)) {
            other = other.toJS()
        }
        transaction(() => {
            if (isPlainObject(other))
                Object.keys(other).forEach(key => this.set((key as any) as K, other[key]))
            else if (Array.isArray(other)) other.forEach(([key, value]) => this.set(key, value))
            else if (isES6Map(other)) other.forEach((value, key) => this.set(key, value))
            else if (other !== null && other !== undefined)
                fail("Cannot initialize map from " + other)
        })
        return this
    }

    clear() {
        transaction(() => {
            untracked(() => {
                for (const key of this.keys()) this.delete(key)
            })
        })
    }

    replace(values: ObservableMap<K, V> | IKeyValueMap<V> | any): ObservableMap<K, V> {
        transaction(() => {
            // grab all the keys that are present in the new map but not present in the current map
            // and delete them from the map, then merge the new map
            // this will cause reactions only on changed values
            const newKeys = (getMapLikeKeys(values) as any) as K[]
            const oldKeys = Array.from(this.keys())
            const missingKeys = oldKeys.filter(k => newKeys.indexOf(k) === -1)
            missingKeys.forEach(k => this.delete(k))
            this.merge(values)
        })
        return this
    }

    get size(): number {
        this._keysAtom.reportObserved()
        return this._data.size
    }

    /**
     * Returns a plain object that represents this map.
     * Note that all the keys being stringified.
     * If there are duplicating keys after converting them to strings, behaviour is undetermined.
     */
    toPOJO(): IKeyValueMap<V> {
        const res: IKeyValueMap<V> = {}
        for (const [key, value] of this) {
            res["" + key] = value
        }
        return res
    }

    /**
     * Returns a shallow non observable object clone of this map.
     * Note that the values migth still be observable. For a deep clone use mobx.toJS.
     */
    toJS(): Map<K, V> {
        return new Map(this)
    }

    toJSON(): IKeyValueMap<V> {
        // Used by JSON.stringify
        return this.toPOJO()
    }

    toString(): string {
        return (
            this.name +
            "[{ " +
            Array.from(this.keys())
                .map(key => `${key}: ${"" + this.get(key)}`)
                .join(", ") +
            " }]"
        )
    }

    [Symbol.toStringTag]: "Map" = "Map"

    /**
     * Observes this object. Triggers for the events 'add', 'update' and 'delete'.
     * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/observe
     * for callback details
     */
    observe(listener: (changes: IMapDidChange<K, V>) => void, fireImmediately?: boolean): Lambda {
        process.env.NODE_ENV !== "production" &&
            invariant(
                fireImmediately !== true,
                "`observe` doesn't support fireImmediately=true in combination with maps."
            )
        return registerListener(this, listener)
    }

    intercept(handler: IInterceptor<IMapWillChange<K, V>>): Lambda {
        return registerInterceptor(this, handler)
    }
}

/* 'var' fixes small-build issue */
export var isObservableMap = createInstanceofPredicate("ObservableMap", ObservableMap) as (
    thing: any
) => thing is ObservableMap<any, any>
