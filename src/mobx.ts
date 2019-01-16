/**
 * (c) Michel Weststrate 2015 - 2018
 * MIT Licensed
 *
 * Welcome to the mobx sources! To get an global overview of how MobX internally works,
 * this is a good place to start:
 * https://medium.com/@mweststrate/becoming-fully-reactive-an-in-depth-explanation-of-mobservable-55995262a254#.xvbh6qd74
 *
 * Source folders:
 * ===============
 *
 * - api/     Most of the public static methods exposed by the module can be found here.
 * - core/    Implementation of the MobX algorithm; atoms, derivations, reactions, dependency trees, optimizations. Cool stuff can be found here.
 * - types/   All the magic that is need to have observable objects, arrays and values is in this folder. Including the modifiers like `asFlat`.
 * - utils/   Utility stuff.
 *
 */

if (typeof Proxy === "undefined" || typeof Symbol === "undefined") {
    throw new Error(
        "[mobx] MobX 5+ requires Proxy and Symbol objects. If your environment doesn't support Proxy objects, please downgrade to MobX 4. For React Native Android, consider upgrading JSCore."
    )
}

declare var window: any
try {
    // define process.env if needed
    // if this is not a production build in the first place
    // (in which case the expression below would be substituted with 'production')
    process.env.NODE_ENV
} catch (e) {
    var g = typeof window !== "undefined" ? window : global
    if (typeof process === "undefined") g.process = {}
    g.process.env = {}
}

;(() => {
    function testCodeMinification() {}
    if (
        testCodeMinification.name !== "testCodeMinification" &&
        process.env.NODE_ENV !== "production" &&
        process.env.IGNORE_MOBX_MINIFY_WARNING !== "true"
    ) {
        console.warn(
            // Template literal(backtick) is used for fix issue with rollup-plugin-commonjs https://github.com/rollup/rollup-plugin-commonjs/issues/344
            `[mobx] you are running a minified build, but 'process.env.NODE_ENV' was not set to 'production' in your bundler. This results in an unnecessarily large and slow bundle`
        )
    }
})()

export {
    IObservable,
    IDepTreeNode,
    Reaction,
    IReactionPublic,
    IReactionDisposer,
    IDerivation,
    untracked,
    IDerivationState,
    IAtom,
    createAtom,
    IAction,
    spy,
    IComputedValue,
    IEqualsComparer,
    comparer,
    IEnhancer,
    IInterceptable,
    IInterceptor,
    IListenable,
    IObjectWillChange,
    IObjectDidChange,
    IObservableObject,
    isObservableObject,
    IValueDidChange,
    IValueWillChange,
    IObservableValue,
    isObservableValue as isBoxedObservable,
    IObservableArray,
    IArrayWillChange,
    IArrayWillSplice,
    IArrayChange,
    IArraySplice,
    isObservableArray,
    IKeyValueMap,
    ObservableMap,
    IMapEntries,
    IMapEntry,
    IMapWillChange,
    IMapDidChange,
    isObservableMap,
    IObservableMapInitialValues,
    transaction,
    observable,
    IObservableFactory,
    IObservableFactories,
    computed,
    IComputed,
    isObservable,
    isObservableProp,
    isComputed,
    isComputedProp,
    extendObservable,
    observe,
    intercept,
    autorun,
    IAutorunOptions,
    reaction,
    IReactionOptions,
    when,
    IWhenOptions,
    action,
    isAction,
    runInAction,
    IActionFactory,
    keys,
    values,
    entries,
    set,
    remove,
    has,
    get,
    decorate,
    configure,
    onBecomeObserved,
    onBecomeUnobserved,
    flow,
    toJS,
    trace,
    IObserverTree,
    IDependencyTree,
    getDependencyTree,
    getObserverTree,
    resetGlobalState as _resetGlobalState,
    getGlobalState as _getGlobalState,
    getDebugName,
    getAtom,
    getAdministration as _getAdministration,
    allowStateChanges as _allowStateChanges,
    allowStateChangesInsideComputed as _allowStateChangesInsideComputed,
    Lambda,
    isArrayLike,
    $mobx,
    isComputingDerivation as _isComputingDerivation,
    onReactionError,
    interceptReads as _interceptReads,
    IComputedValueOptions
} from "./internal"

// Devtools support
import { spy, getDebugName, $mobx } from "./internal"

declare var __MOBX_DEVTOOLS_GLOBAL_HOOK__: { injectMobx: ((any) => void) }
if (typeof __MOBX_DEVTOOLS_GLOBAL_HOOK__ === "object") {
    // See: https://github.com/andykog/mobx-devtools/
    __MOBX_DEVTOOLS_GLOBAL_HOOK__.injectMobx({
        spy,
        extras: {
            getDebugName
        },
        $mobx
    })
}
