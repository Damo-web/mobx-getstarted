const mobx = require("../../src/mobx.ts")
const m = mobx

const { $mobx } = mobx

test("treeD", function() {
    m._resetGlobalState()
    mobx._getGlobalState().mobxGuid = 0
    var a = m.observable.box(3)
    var aName = "ObservableValue@1"

    var dtree = m.getDependencyTree
    expect(dtree(a)).toEqual({
        name: aName
    })

    var b = m.computed(() => a.get() * a.get())
    var bName = "ComputedValue@3"
    expect(dtree(b)).toEqual({
        name: bName
        // no dependencies yet, since it isn't observed yet
    })

    var c = m.autorun(() => b.get())
    var cName = "Autorun@4"
    expect(dtree(c[$mobx])).toEqual({
        name: cName,
        dependencies: [
            {
                name: bName,
                dependencies: [
                    {
                        name: aName
                    }
                ]
            }
        ]
    })

    expect(aName !== bName).toBeTruthy()
    expect(bName !== cName).toBeTruthy()

    expect(m.getObserverTree(a)).toEqual({
        name: aName,
        observers: [
            {
                name: bName,
                observers: [
                    {
                        name: cName
                    }
                ]
            }
        ]
    })

    var x = mobx.observable.map({ temperature: 0 })
    var d = mobx.autorun(function() {
        Array.from(x.keys())
        if (x.has("temperature")) x.get("temperature")
        x.has("absent")
    })

    expect(m.getDependencyTree(d[$mobx])).toEqual({
        name: "Autorun@7",
        dependencies: [
            {
                name: "ObservableMap@6.keys()"
            },
            {
                name: "ObservableMap@6.temperature?"
            },
            {
                name: "ObservableMap@6.temperature"
            },
            {
                name: "ObservableMap@6.absent?"
            }
        ]
    })
})

test("names", function() {
    m._resetGlobalState()
    mobx._getGlobalState().mobxGuid = 0

    var struct = {
        x: "ObservableValue@1",
        y: {
            z: 7
        },
        ar: [
            4,
            {
                w: 5
            }
        ]
    }

    var rstruct = m.observable(struct)
    m.extendObservable(rstruct.y, { a: { b: 2 } })
    rstruct.ar.push({ b: 2 })
    rstruct.ar.push([])
    expect(rstruct[$mobx].values.get("x").name).toBe("ObservableObject@1.x")
    expect(rstruct[$mobx].values.get("y").name).toBe("ObservableObject@1.y")
    expect(rstruct.y[$mobx].values.get("z").name).toBe("ObservableObject@1.y.z")
    expect(rstruct[$mobx].values.get("ar").name).toBe("ObservableObject@1.ar")
    expect(rstruct.ar[$mobx].atom.name).toBe("ObservableObject@1.ar")
    expect(rstruct.ar[1][$mobx].values.get("w").name).toBe("ObservableObject@1.ar[..].w")
    expect(rstruct.y.a[$mobx].values.get("b").name).toBe("ObservableObject@1.y.a.b")
    expect(rstruct.ar[2][$mobx].values.get("b").name).toBe("ObservableObject@1.ar[..].b")

    var d = m.autorun(function() {})
    expect(d[$mobx].name).toBeTruthy()

    expect(m.autorun(function namedFunction() {})[$mobx].name).toBe("namedFunction")

    expect(m.computed(function() {})).toBeTruthy()

    expect(m.computed(function namedFunction() {}).name).toBe("namedFunction")

    function Task() {
        m.extendObservable(this, {
            title: "test"
        })
    }

    var task = new Task()
    expect(task[$mobx].name).toBe("Task@8")
    expect(task[$mobx].values.get("title").name).toBe("Task@8.title")
})

function stripTrackerOutput(output) {
    return output.map(function(i) {
        if (Array.isArray(i)) return stripTrackerOutput(i)
        delete i.object
        delete i.time
        delete i.fn
        return i
    })
}

test("spy 1", function() {
    m._resetGlobalState()
    var lines = []

    var a = m.observable.box(3)
    var b = m.computed(function() {
        return a.get() * 2
    })
    var c = m.autorun(function() {
        b.get()
    })
    var stop = m.spy(function(line) {
        lines.push(line)
    })

    a.set(4)
    stop()
    a.set(5)
    expect(stripTrackerOutput(lines)).toMatchSnapshot()
})

test("get atom", function() {
    mobx._resetGlobalState()
    mobx._getGlobalState().mobxGuid = 0 // hmm dangerous reset?

    function Clazz() {
        mobx.extendObservable(this, {
            a: 17
        })
    }

    var a = mobx.observable.box(3)
    var b = mobx.observable({ a: 3 })
    var c = mobx.observable.map({ a: 3 })
    var d = mobx.observable([1, 2])
    var e = mobx.computed(() => 3)
    var f = mobx.autorun(() => c.has("b"))
    var g = new Clazz()

    function atom(thing, prop) {
        return mobx.getAtom(thing, prop).constructor.name
    }

    var ovClassName = mobx.observable.box(3).constructor.name
    var atomClassName = mobx.createAtom("test").constructor.name
    var reactionClassName = mobx.Reaction.name

    expect(atom(a)).toBe(ovClassName)

    expect(atom(b, "a")).toBe(ovClassName)
    expect(() => atom(b)).toThrowError(/please specify a property/)
    expect(() => atom(b, "b")).toThrowError(
        /no observable property 'b' found on the observable object 'ObservableObject@2'/
    )

    expect(atom(c)).toBe(atomClassName) // returns ke, "bla".constructor, === "Atomys
    expect(atom(c, "a")).toBe(ovClassName) // returns ent, "bla".constructor, === "Atomry
    expect(atom(c, "b")).toBe(ovClassName) // returns has entry (see autoru, "bla", "Atomn)
    expect(() => atom(c, "c")).toThrowError(
        /the entry 'c' does not exist in the observable map 'ObservableMap@3'/
    )

    expect(atom(d)).toBe(atomClassName)
    expect(() => atom(d, 0)).toThrowError(/It is not possible to get index atoms from arrays/)

    expect(atom(e)).toBe(mobx.computed(() => {}).constructor.name)
    expect(atom(f)).toBe(mobx.Reaction.name)

    expect(() => atom(g)).toThrowError(/please specify a property/)
    expect(atom(g, "a")).toBe(ovClassName)

    f()
})

test("get debug name", function() {
    mobx._resetGlobalState()
    mobx._getGlobalState().mobxGuid = 0 // hmm dangerous reset?

    function Clazz() {
        mobx.extendObservable(this, {
            a: 17
        })
    }

    var a = mobx.observable.box(3)
    var b = mobx.observable({ a: 3 })
    var c = mobx.observable.map({ a: 3 })
    var d = mobx.observable([1, 2])
    var e = mobx.computed(() => 3)
    var f = mobx.autorun(() => c.has("b"))
    var g = new Clazz()
    var h = mobx.observable({ b: function() {}, c() {} })

    function name(thing, prop) {
        return mobx.getDebugName(thing, prop)
    }

    expect(name(a)).toBe("ObservableValue@1")

    expect(name(b, "a")).toBe("ObservableObject@2.a")
    expect(() => name(b, "b")).toThrowError(
        /no observable property 'b' found on the observable object 'ObservableObject@2'/
    )

    expect(name(c)).toBe("ObservableMap@3") // returns ke, "bla"ys
    expect(name(c, "a")).toBe("ObservableMap@3.a") // returns ent, "bla"ry
    expect(name(c, "b")).toBe("ObservableMap@3.b?") // returns has entry (see autoru, "bla"n)
    expect(() => name(c, "c")).toThrowError(
        /the entry 'c' does not exist in the observable map 'ObservableMap@3'/
    )

    expect(name(d)).toBe("ObservableArray@4")
    expect(() => name(d, 0)).toThrowError(/It is not possible to get index atoms from arrays/)

    expect(name(e)).toBe("ComputedValue@6")
    expect(name(f)).toBe("Autorun@7")

    expect(name(g)).toBe("Clazz@9")
    expect(name(g, "a")).toBe("Clazz@9.a")

    expect(name(h, "b")).toBe("ObservableObject@10.b")
    expect(name(h, "c")).toBe("ObservableObject@10.c")

    f()
})

test("get administration", function() {
    mobx._resetGlobalState()
    mobx._getGlobalState().mobxGuid = 0 // hmm dangerous reset?

    function Clazz() {
        mobx.extendObservable(this, {
            a: 17
        })
    }

    var a = mobx.observable.box(3)
    var b = mobx.observable({ a: 3 })
    var c = mobx.observable.map({ a: 3 })
    var d = mobx.observable([1, 2])
    var e = mobx.computed(() => 3)
    var f = mobx.autorun(() => c.has("b"))
    var g = new Clazz()
    const h = {}
    mobx.extendObservable(h, { a: 3 })

    function adm(thing, prop) {
        return mobx._getAdministration(thing, prop).constructor.name
    }

    var ovClassName = mobx.observable.box(3).constructor.name
    var mapClassName = mobx.observable.map().constructor.name

    expect(adm(a)).toBe(ovClassName)

    expect(adm(b, "a")).toBe(ovClassName)
    expect(adm(b)).toBe(b[$mobx].constructor.name)
    expect(() => adm(b, "b")).toThrowError(
        /no observable property 'b' found on the observable object 'ObservableObject@2'/
    )
    expect(adm(h, "a")).toBe(ovClassName)
    expect(adm(h)).toBe(h[$mobx].constructor.name)
    expect(() => adm(h, "b")).toThrowError(
        /no observable property 'b' found on the observable object 'ObservableObject@10'/
    )

    expect(adm(c)).toBe(mapClassName)
    expect(adm(c, "a")).toBe(ovClassName)
    expect(adm(c, "b")).toBe(ovClassName)
    expect(() => adm(c, "c")).toThrowError(
        /the entry 'c' does not exist in the observable map 'ObservableMap@3'/
    )

    expect(adm(d)).toBe(d[$mobx].constructor.name)
    expect(() => adm(d, 0)).toThrowError(/It is not possible to get index atoms from arrays/)

    expect(adm(e)).toBe(mobx.computed(() => {}).constructor.name)
    expect(adm(f)).toBe(mobx.Reaction.name)

    expect(adm(g)).toBe(h[$mobx].constructor.name)
    expect(adm(g, "a")).toBe(ovClassName)
})

test("onBecome(Un)Observed simple", () => {
    const x = mobx.observable.box(3)
    const events = []

    const d1 = mobx.onBecomeObserved(x, () => {
        events.push("x observed")
    })
    const d2 = mobx.onBecomeUnobserved(x, () => {
        events.push("x unobserved")
    })

    expect(events.length).toBe(0) // nothing happened yet
    x.get()
    expect(events.length).toBe(0) // nothing happened yet
    x.set(4)
    expect(events.length).toBe(0) // nothing happened yet

    const d5 = mobx.reaction(() => x.get(), () => {})
    expect(events.length).toBe(1)
    expect(events).toEqual(["x observed"])

    d5()
    expect(events.length).toBe(2)
    expect(events).toEqual(["x observed", "x unobserved"])
})

test("onBecome(Un)Observed - less simple", () => {
    const x = mobx.observable({
        a: 3,
        get b() {
            return this.a * 2
        }
    })
    const events = []

    const d1 = mobx.onBecomeObserved(x, "a", () => {
        events.push("a observed")
    })
    const d2 = mobx.onBecomeUnobserved(x, "a", () => {
        events.push("a unobserved")
    })
    const d3 = mobx.onBecomeObserved(x, "b", () => {
        events.push("b observed")
    })
    const d4 = mobx.onBecomeUnobserved(x, "b", () => {
        events.push("b unobserved")
    })

    x.b
    x.a = 4

    expect(events.length).toBe(0) // nothing happened yet

    const d5 = mobx.reaction(() => x.b, () => {})
    expect(events.length).toBe(2)
    expect(events).toEqual(["b observed", "a observed"])

    const d6 = mobx.reaction(() => x.b, () => {})
    expect(events.length).toBe(2)

    d5()
    expect(events.length).toBe(2)
    d6()
    expect(events.length).toBe(4)
    expect(events).toEqual(["b observed", "a observed", "b unobserved", "a unobserved"])

    d1()
    d2()
    d3()
    d4()
    events.splice(0)
    const d7 = mobx.reaction(() => x.b, () => {})
    d7()
    expect(events.length).toBe(0)
})

test("onBecomeObserved correctly disposes second listener #1537", () => {
    const x = mobx.observable.box(3)
    const events = []
    const d1 = mobx.onBecomeObserved(x, "a", () => {
        events.push("a observed")
    })
    const d2 = mobx.onBecomeObserved(x, "b", () => {
        events.push("b observed")
    })
    d1()
    mobx.reaction(() => x.get(), () => {})
    expect(events.length).toBe(1)
    expect(events).toEqual(["b observed"])
})

test("onBecomeObserved correctly disposes second listener #1537", () => {
    const x = mobx.observable.box(3)
    const events = []
    const d1 = mobx.onBecomeObserved(x, "a", () => {
        events.push("a observed")
    })
    const d2 = mobx.onBecomeObserved(x, "b", () => {
        events.push("b observed")
    })
    d1()
    const d3 = mobx.reaction(() => x.get(), () => {})
    d3()
    expect(events.length).toBe(1)
    expect(events).toEqual(["b observed"])
    d2()
    const d4 = mobx.reaction(() => x.get(), () => {})
    expect(events).toEqual(["b observed"])
})

test("onBecomeUnobserved correctly disposes second listener #1537", () => {
    const x = mobx.observable.box(3)
    const events = []
    const d1 = mobx.onBecomeUnobserved(x, "a", () => {
        events.push("a unobserved")
    })
    const d2 = mobx.onBecomeUnobserved(x, "b", () => {
        events.push("b unobserved")
    })
    d1()
    const d3 = mobx.reaction(() => x.get(), () => {})
    d3()
    expect(events.length).toBe(1)
    expect(events).toEqual(["b unobserved"])
    d2()
    const d4 = mobx.reaction(() => x.get(), () => {})
    expect(events).toEqual(["b unobserved"])
})

test("deepEquals should yield correct results for complex objects #1118 - 1", () => {
    const d2016jan1 = new Date("2016-01-01")
    const d2016jan1_2 = new Date("2016-01-01")
    const d2017jan1 = new Date("2017-01-01")

    expect(d2016jan1).toEqual(d2016jan1_2)
    expect(d2016jan1).not.toEqual(d2017jan1)
    expect(mobx.comparer.structural(d2016jan1, d2016jan1)).toBe(true)
    expect(mobx.comparer.structural(d2016jan1, d2017jan1)).toBe(false)
    expect(mobx.comparer.structural(d2016jan1, d2016jan1_2)).toBe(true)
})

test("deepEquals should yield correct results for complex objects #1118 - 2", () => {
    class A {
        x = 3
        y = 4

        constructor(x) {
            this.x = x
        }
    }

    const a1 = new A(2)
    const a2 = new A(2)
    const a3 = new A(3)
    const a4 = new A(2)
    a4.z = 2

    expect(a1).toEqual(a2)
    expect(a1).not.toEqual(a3)
    expect(mobx.comparer.structural(a1, a1)).toBe(true)
    expect(mobx.comparer.structural(a1, a3)).toBe(false)
    expect(mobx.comparer.structural(a1, a2)).toBe(true)
    expect(mobx.comparer.structural(a1, a4)).toBe(false)
})
