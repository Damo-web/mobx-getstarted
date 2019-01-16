import {
    observable,
    computed,
    transaction,
    autorun,
    extendObservable,
    action,
    isObservableObject,
    observe,
    isObservable,
    isObservableProp,
    isComputedProp,
    spy,
    isAction,
    configure
} from "../../src/mobx.ts"
import * as mobx from "../../src/mobx.ts"

test("babel", function() {
    class Box {
        @observable uninitialized
        @observable height = 20
        @observable sizes = [2]
        @observable
        someFunc = function() {
            return 2
        }
        @computed
        get width() {
            return this.height * this.sizes.length * this.someFunc() * (this.uninitialized ? 2 : 1)
        }
        @action
        addSize() {
            this.sizes.push(3)
            this.sizes.push(4)
        }
    }

    var box = new Box()
    var ar = []
    autorun(() => {
        ar.push(box.width)
    })

    var s = ar.slice()
    expect(s).toEqual([40])
    box.height = 10
    s = ar.slice()
    expect(s).toEqual([40, 20])
    box.sizes.push(3, 4)
    s = ar.slice()
    expect(s).toEqual([40, 20, 60])
    box.someFunc = () => 7
    s = ar.slice()
    expect(s).toEqual([40, 20, 60, 210])
    box.uninitialized = true
    s = ar.slice()
    expect(s).toEqual([40, 20, 60, 210, 420])
    box.addSize()
    s = ar.slice()
    expect(s).toEqual([40, 20, 60, 210, 420, 700])
})

test("should not be possible to use @action with getters", () => {
    expect(() => {
        class A {
            @action
            get Test() {}
        }
    }).toThrowError(/@action cannot be used with getters/)

    mobx._resetGlobalState()
})

test("babel: parameterized computed decorator", () => {
    class TestClass {
        @observable x = 3
        @observable y = 3
        @computed.struct
        get boxedSum() {
            return { sum: Math.round(this.x) + Math.round(this.y) }
        }
    }

    const t1 = new TestClass()
    const changes = []
    const d = autorun(() => changes.push(t1.boxedSum))

    t1.y = 4 // change
    expect(changes.length).toBe(2)
    t1.y = 4.2 // no change
    expect(changes.length).toBe(2)
    transaction(() => {
        t1.y = 3
        t1.x = 4
    }) // no change
    expect(changes.length).toBe(2)
    t1.x = 6 // change
    expect(changes.length).toBe(3)
    d()

    expect(changes).toEqual([{ sum: 6 }, { sum: 7 }, { sum: 9 }])
})

test("computed value should be the same around changing which was considered equivalent", () => {
    class TestClass {
        @observable c = null
        defaultCollection = []
        @computed.struct
        get collection() {
            return this.c || this.defaultCollection
        }
    }

    const t1 = new TestClass()

    const d = autorun(() => t1.collection)

    const oldCollection = t1.collection
    t1.c = []
    const newCollection = t1.collection

    expect(oldCollection).toBe(newCollection)

    d()
})

class Order {
    @observable price = 3
    @observable amount = 2
    @observable orders = []
    @observable aFunction = function(a) {}

    @computed
    get total() {
        return this.amount * this.price * (1 + this.orders.length)
    }
}

test("decorators", function() {
    var o = new Order()
    expect(isObservableObject(o)).toBe(true)
    expect(isObservableProp(o, "amount")).toBe(true)
    expect(o.total).toBe(6) // .... this is required to initialize the props which are made reactive lazily...
    expect(isObservableProp(o, "total")).toBe(true)

    var events = []
    var d1 = observe(o, ev => events.push(ev.name, ev.oldValue))
    var d2 = observe(o, "price", ev => events.push(ev.newValue, ev.oldValue))
    var d3 = observe(o, "total", ev => events.push(ev.newValue, ev.oldValue))

    o.price = 4

    d1()
    d2()
    d3()

    o.price = 5

    expect(events).toEqual([
        8, // new total
        6, // old total
        4, // new price
        3, // old price
        "price", // event name
        3 // event oldValue
    ])
})

test("issue 191 - shared initializers (babel)", function() {
    class Test {
        @observable obj = { a: 1 }
        @observable array = [2]
    }

    var t1 = new Test()
    t1.obj.a = 2
    t1.array.push(3)

    var t2 = new Test()
    t2.obj.a = 3
    t2.array.push(4)

    expect(t1.obj).not.toBe(t2.obj)
    expect(t1.array).not.toBe(t2.array)
    expect(t1.obj.a).toBe(2)
    expect(t2.obj.a).toBe(3)

    expect(t1.array.slice()).toEqual([2, 3])
    expect(t2.array.slice()).toEqual([2, 4])
})

test("705 - setter undoing caching (babel)", () => {
    let recomputes = 0
    let autoruns = 0

    class Person {
        @observable name
        @observable title
        set fullName(val) {
            // Noop
        }
        @computed
        get fullName() {
            recomputes++
            return this.title + " " + this.name
        }
    }

    let p1 = new Person()
    p1.name = "Tom Tank"
    p1.title = "Mr."

    expect(recomputes).toBe(0)
    expect(autoruns).toBe(0)

    const d1 = autorun(() => {
        autoruns++
        p1.fullName
    })

    const d2 = autorun(() => {
        autoruns++
        p1.fullName
    })

    expect(recomputes).toBe(1)
    expect(autoruns).toBe(2)

    p1.title = "Master"
    expect(recomputes).toBe(2)
    expect(autoruns).toBe(4)

    d1()
    d2()
})

function normalizeSpyEvents(events) {
    events.forEach(ev => {
        delete ev.fn
        delete ev.time
    })
    return events
}

test("action decorator (babel)", function() {
    class Store {
        constructor(multiplier) {
            this.multiplier = multiplier
        }

        @action
        add(a, b) {
            return (a + b) * this.multiplier
        }
    }

    const store1 = new Store(2)
    const store2 = new Store(3)
    const events = []
    const d = spy(events.push.bind(events))
    expect(store1.add(3, 4)).toBe(14)
    expect(store2.add(3, 4)).toBe(21)
    expect(store1.add(1, 1)).toBe(4)

    expect(normalizeSpyEvents(events)).toEqual([
        { arguments: [3, 4], name: "add", spyReportStart: true, object: store1, type: "action" },
        { spyReportEnd: true },
        { arguments: [3, 4], name: "add", spyReportStart: true, object: store2, type: "action" },
        { spyReportEnd: true },
        { arguments: [1, 1], name: "add", spyReportStart: true, object: store1, type: "action" },
        { spyReportEnd: true }
    ])

    d()
})

test("custom action decorator (babel)", function() {
    class Store {
        constructor(multiplier) {
            this.multiplier = multiplier
        }

        @action("zoem zoem")
        add(a, b) {
            return (a + b) * this.multiplier
        }
    }

    const store1 = new Store(2)
    const store2 = new Store(3)
    const events = []
    const d = spy(events.push.bind(events))
    expect(store1.add(3, 4)).toBe(14)
    expect(store2.add(3, 4)).toBe(21)
    expect(store1.add(1, 1)).toBe(4)

    expect(normalizeSpyEvents(events)).toEqual([
        {
            arguments: [3, 4],
            name: "zoem zoem",
            spyReportStart: true,
            object: store1,
            type: "action"
        },
        { spyReportEnd: true },
        {
            arguments: [3, 4],
            name: "zoem zoem",
            spyReportStart: true,
            object: store2,
            type: "action"
        },
        { spyReportEnd: true },
        {
            arguments: [1, 1],
            name: "zoem zoem",
            spyReportStart: true,
            object: store1,
            type: "action"
        },
        { spyReportEnd: true }
    ])

    d()
})

test("action decorator on field (babel)", function() {
    class Store {
        constructor(multiplier) {
            this.multiplier = multiplier
        }

        @action
        add = (a, b) => {
            return (a + b) * this.multiplier
        }
    }

    const store1 = new Store(2)
    const store2 = new Store(7)

    const events = []
    const d = spy(events.push.bind(events))
    expect(store1.add(3, 4)).toBe(14)
    expect(store2.add(5, 4)).toBe(63)
    expect(store1.add(2, 2)).toBe(8)

    expect(normalizeSpyEvents(events)).toEqual([
        { arguments: [3, 4], name: "add", spyReportStart: true, object: store1, type: "action" },
        { spyReportEnd: true },
        { arguments: [5, 4], name: "add", spyReportStart: true, object: store2, type: "action" },
        { spyReportEnd: true },
        { arguments: [2, 2], name: "add", spyReportStart: true, object: store1, type: "action" },
        { spyReportEnd: true }
    ])

    d()
})

test("custom action decorator on field (babel)", function() {
    class Store {
        constructor(multiplier) {
            this.multiplier = multiplier
        }

        @action("zoem zoem")
        add = (a, b) => {
            return (a + b) * this.multiplier
        }
    }

    const store1 = new Store(2)
    const store2 = new Store(7)

    const events = []
    const d = spy(events.push.bind(events))
    expect(store1.add(3, 4)).toBe(14)
    expect(store2.add(5, 4)).toBe(63)
    expect(store1.add(2, 2)).toBe(8)

    expect(normalizeSpyEvents(events)).toEqual([
        {
            arguments: [3, 4],
            name: "zoem zoem",
            spyReportStart: true,
            object: store1,
            type: "action"
        },
        { spyReportEnd: true },
        {
            arguments: [5, 4],
            name: "zoem zoem",
            spyReportStart: true,
            object: store2,
            type: "action"
        },
        { spyReportEnd: true },
        {
            arguments: [2, 2],
            name: "zoem zoem",
            spyReportStart: true,
            object: store1,
            type: "action"
        },
        { spyReportEnd: true }
    ])

    d()
})

test("267 (babel) should be possible to declare properties observable outside strict mode", () => {
    configure({ enforceActions: "observed" })

    class Store {
        @observable timer
    }

    configure({ enforceActions: "never" })
})

test("288 atom not detected for object property", () => {
    class Store {
        @mobx.observable foo = ""
    }

    const store = new Store()
    let changed = false

    mobx.observe(
        store,
        "foo",
        () => {
            changed = true
        },
        true
    )
    expect(changed).toBe(true)
})

test.skip("observable performance", () => {
    const AMOUNT = 100000

    class A {
        @observable a = 1
        @observable b = 2
        @observable c = 3
        @computed
        get d() {
            return this.a + this.b + this.c
        }
    }

    const objs = []
    const start = Date.now()

    for (var i = 0; i < AMOUNT; i++) objs.push(new A())

    console.log("created in ", Date.now() - start)

    for (var j = 0; j < 4; j++) {
        for (var i = 0; i < AMOUNT; i++) {
            const obj = objs[i]
            obj.a += 3
            obj.b *= 4
            obj.c = obj.b - obj.a
            obj.d
        }
    }

    console.log("changed in ", Date.now() - start)
})

test("unbound methods", () => {
    class A {
        // shared across all instances
        @action
        m1() {}

        // per instance
        @action m2 = () => {}
    }

    const a1 = new A()
    const a2 = new A()

    expect(a1.m1).toBe(a2.m1)
    expect(a1.m2).not.toBe(a2.m2)
    expect(a1.hasOwnProperty("m1")).toBe(false)
    expect(a1.hasOwnProperty("m2")).toBe(true)
    expect(a2.hasOwnProperty("m1")).toBe(false)
    expect(a2.hasOwnProperty("m2")).toBe(true)
})

test("inheritance", () => {
    class A {
        @observable a = 2
    }

    class B extends A {
        @observable b = 3
        @computed
        get c() {
            return this.a + this.b
        }
    }

    const b1 = new B()
    const b2 = new B()
    const values = []
    mobx.autorun(() => values.push(b1.c + b2.c))

    b1.a = 3
    b1.b = 4
    b2.b = 5
    b2.a = 6

    expect(values).toEqual([10, 11, 12, 14, 18])
})

test("inheritance overrides observable", () => {
    class A {
        @observable a = 2
    }

    class B {
        @observable a = 5
        @observable b = 3
        @computed
        get c() {
            return this.a + this.b
        }
    }

    const b1 = new B()
    const b2 = new B()
    const values = []
    mobx.autorun(() => values.push(b1.c + b2.c))

    b1.a = 3
    b1.b = 4
    b2.b = 5
    b2.a = 6

    expect(values).toEqual([16, 14, 15, 17, 18])
})

test("reusing initializers", () => {
    class A {
        @observable a = 3
        @observable b = this.a + 2
        @computed
        get c() {
            return this.a + this.b
        }
        @computed
        get d() {
            return this.c + 1
        }
    }

    const a = new A()
    const values = []
    mobx.autorun(() => values.push(a.d))

    a.a = 4
    expect(values).toEqual([9, 10])
})

test("enumerability", () => {
    class A {
        @observable a = 1 // enumerable, on proto
        @observable a2 = 2
        @computed
        get b() {
            return this.a
        } // non-enumerable, (and, ideally, on proto)
        @action
        m() {} // non-enumerable, on proto
        @action m2 = () => {} // non-enumerable, on self
    }

    const a = new A()

    // not initialized yet
    let ownProps = Object.keys(a)
    let props = []
    for (var key in a) props.push(key)

    expect(ownProps).toEqual([
        // should have a, not supported yet in babel...
    ])

    expect(props).toEqual(["a", "a2"])

    expect("a" in a).toBe(true)
    expect(a.hasOwnProperty("a")).toBe(false)
    expect(a.hasOwnProperty("b")).toBe(false) // true would be more consistent, see below
    expect(a.hasOwnProperty("m")).toBe(false)
    expect(a.hasOwnProperty("m2")).toBe(true)

    expect(mobx.isAction(a.m)).toBe(true)
    expect(mobx.isAction(a.m2)).toBe(true)

    // after initialization
    a.a
    a.b
    a.m
    a.m2

    ownProps = Object.keys(a)
    props = []
    for (var key in a) props.push(key)

    expect(ownProps).toEqual([
        "a",
        "a2" // a2 is now initialized as well, altough never accessed!
    ])

    expect(props).toEqual(["a", "a2"])

    expect("a" in a).toBe(true)
    expect(a.hasOwnProperty("a")).toBe(true)
    expect(a.hasOwnProperty("a2")).toBe(true)
    expect(a.hasOwnProperty("b")).toBe(true) // true would better.. but, #1777
    expect(a.hasOwnProperty("m")).toBe(false)
    expect(a.hasOwnProperty("m2")).toBe(true)
})

test("enumerability - workaround", () => {
    class A {
        @observable a = 1 // enumerable, on proto
        @observable a2 = 2
        @computed
        get b() {
            return this.a
        } // non-enumerable, (and, ideally, on proto)
        @action
        m() {} // non-enumerable, on proto
        @action m2 = () => {} // non-enumerable, on self

        constructor() {
            this.a = 1
            this.a2 = 2
        }
    }

    const a = new A()

    const ownProps = Object.keys(a)
    const props = []
    for (var key in a) props.push(key)

    expect(ownProps).toEqual([
        "a",
        "a2" // a2 is now initialized as well, altough never accessed!
    ])

    expect(props).toEqual(["a", "a2"])

    expect("a" in a).toBe(true)
    expect(a.hasOwnProperty("a")).toBe(true)
    expect(a.hasOwnProperty("a2")).toBe(true)
    expect(a.hasOwnProperty("b")).toBe(true) // ideally, false, but #1777
    expect(a.hasOwnProperty("m")).toBe(false)
    expect(a.hasOwnProperty("m2")).toBe(true)
})

test("issue 285 (babel)", () => {
    const { observable, toJS } = mobx

    class Todo {
        id = 1
        @observable title
        @observable finished = false
        @observable childThings = [1, 2, 3]
        constructor(title) {
            this.title = title
        }
    }

    var todo = new Todo("Something to do")

    expect(toJS(todo)).toEqual({
        id: 1,
        title: "Something to do",
        finished: false,
        childThings: [1, 2, 3]
    })
})

test("verify object assign (babel)", () => {
    class Todo {
        @observable title = "test"
        @computed
        get upperCase() {
            return this.title.toUpperCase()
        }
    }

    const todo = new Todo()
    expect(Object.assign({}, todo)).toEqual({
        //		Should be:	title: "test"!
    })

    todo.title // lazy initialization :'(

    expect(Object.assign({}, todo)).toEqual({
        title: "test"
    })
})

test("379, inheritable actions (babel)", () => {
    class A {
        @action
        method() {
            return 42
        }
    }

    class B extends A {
        @action
        method() {
            return super.method() * 2
        }
    }

    class C extends B {
        @action
        method() {
            return super.method() + 3
        }
    }

    const b = new B()
    expect(b.method()).toBe(84)
    expect(isAction(b.method)).toBe(true)

    const a = new A()
    expect(a.method()).toBe(42)
    expect(isAction(a.method)).toBe(true)

    const c = new C()
    expect(c.method()).toBe(87)
    expect(isAction(c.method)).toBe(true)
})

test("379, inheritable actions - 2 (babel)", () => {
    class A {
        @action("a method")
        method() {
            return 42
        }
    }

    class B extends A {
        @action("b method")
        method() {
            return super.method() * 2
        }
    }

    class C extends B {
        @action("c method")
        method() {
            return super.method() + 3
        }
    }

    const b = new B()
    expect(b.method()).toBe(84)
    expect(isAction(b.method)).toBe(true)

    const a = new A()
    expect(a.method()).toBe(42)
    expect(isAction(a.method)).toBe(true)

    const c = new C()
    expect(c.method()).toBe(87)
    expect(isAction(c.method)).toBe(true)
})

test("505, don't throw when accessing subclass fields in super constructor (babel)", () => {
    const values = {}
    class A {
        @observable a = 1
        constructor() {
            values.b = this.b
            values.a = this.a
        }
    }

    class B extends A {
        @observable b = 2
    }

    new B()
    expect(values).toEqual({ a: 1, b: 2 }) // In the TS test b is undefined, which is actually the expected behavior?
})

test("computed setter should succeed (babel)", function() {
    class Bla {
        @observable a = 3
        @computed
        get propX() {
            return this.a * 2
        }
        set propX(v) {
            this.a = v
        }
    }

    const b = new Bla()
    expect(b.propX).toBe(6)
    b.propX = 4
    expect(b.propX).toBe(8)
})

test("computed getter / setter for plan objects should succeed (babel)", function() {
    const b = observable({
        a: 3,
        get propX() {
            return this.a * 2
        },
        set propX(v) {
            this.a = v
        }
    })

    const values = []
    mobx.autorun(() => values.push(b.propX))
    expect(b.propX).toBe(6)
    b.propX = 4
    expect(b.propX).toBe(8)

    expect(values).toEqual([6, 8])
})

test("issue #701", () => {
    class Model {
        @observable a = 5
    }

    const model = new Model()

    expect(mobx.toJS(model)).toEqual({ a: 5 })
    expect(mobx.isObservable(model)).toBe(true)
    expect(mobx.isObservableObject(model)).toBe(true)
})

test("@observable.ref (Babel)", () => {
    class A {
        @observable.ref ref = { a: 3 }
    }

    const a = new A()
    expect(a.ref.a).toBe(3)
    expect(mobx.isObservable(a.ref)).toBe(false)
    expect(mobx.isObservableProp(a, "ref")).toBe(true)
})

test("@observable.shallow (Babel)", () => {
    class A {
        @observable.shallow arr = [{ todo: 1 }]
    }

    const a = new A()
    const todo2 = { todo: 2 }
    a.arr.push(todo2)
    expect(mobx.isObservable(a.arr)).toBe(true)
    expect(mobx.isObservableProp(a, "arr")).toBe(true)
    expect(mobx.isObservable(a.arr[0])).toBe(false)
    expect(mobx.isObservable(a.arr[1])).toBe(false)
    expect(a.arr[1] === todo2).toBeTruthy()
})

test("@observable.deep (Babel)", () => {
    class A {
        @observable.deep arr = [{ todo: 1 }]
    }

    const a = new A()
    const todo2 = { todo: 2 }
    a.arr.push(todo2)

    expect(mobx.isObservable(a.arr)).toBe(true)
    expect(mobx.isObservableProp(a, "arr")).toBe(true)
    expect(mobx.isObservable(a.arr[0])).toBe(true)
    expect(mobx.isObservable(a.arr[1])).toBe(true)
    expect(a.arr[1] !== todo2).toBeTruthy()
    expect(isObservable(todo2)).toBe(false)
})

test("action.bound binds (Babel)", () => {
    class A {
        @observable x = 0
        @action.bound
        inc(value) {
            this.x += value
        }
    }

    const a = new A()
    const runner = a.inc
    runner(2)

    expect(a.x).toBe(2)
})

test("@computed.equals (Babel)", () => {
    const sameTime = (from, to) => from.hour === to.hour && from.minute === to.minute
    class Time {
        constructor(hour, minute) {
            this.hour = hour
            this.minute = minute
        }

        @observable hour
        @observable minute

        @computed({ equals: sameTime })
        get time() {
            return { hour: this.hour, minute: this.minute }
        }
    }
    const time = new Time(9, 0)

    const changes = []
    const disposeAutorun = autorun(() => changes.push(time.time))

    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.hour = 9
    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.minute = 0
    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.hour = 10
    expect(changes).toEqual([{ hour: 9, minute: 0 }, { hour: 10, minute: 0 }])
    time.minute = 30
    expect(changes).toEqual([
        { hour: 9, minute: 0 },
        { hour: 10, minute: 0 },
        { hour: 10, minute: 30 }
    ])

    disposeAutorun()
})

test("computed comparer works with decorate (babel)", () => {
    const sameTime = (from, to) => from.hour === to.hour && from.minute === to.minute
    class Time {
        constructor(hour, minute) {
            this.hour = hour
            this.minute = minute
        }

        get time() {
            return { hour: this.hour, minute: this.minute }
        }
    }
    mobx.decorate(Time, {
        hour: observable,
        minute: observable,
        time: computed({ equals: sameTime })
    })
    const time = new Time(9, 0)

    const changes = []
    const disposeAutorun = autorun(() => changes.push(time.time))

    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.hour = 9
    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.minute = 0
    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.hour = 10
    expect(changes).toEqual([{ hour: 9, minute: 0 }, { hour: 10, minute: 0 }])
    time.minute = 30
    expect(changes).toEqual([
        { hour: 9, minute: 0 },
        { hour: 10, minute: 0 },
        { hour: 10, minute: 30 }
    ])

    disposeAutorun()
})

test("computed comparer works with decorate (babel) - 2", () => {
    const sameTime = (from, to) => from.hour === to.hour && from.minute === to.minute
    class Time {
        constructor(hour, minute) {
            extendObservable(
                this,
                {
                    hour,
                    minute,
                    get time() {
                        return { hour: this.hour, minute: this.minute }
                    }
                },
                {
                    time: computed({ equals: sameTime })
                }
            )
        }
    }
    const time = new Time(9, 0)

    const changes = []
    const disposeAutorun = autorun(() => changes.push(time.time))

    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.hour = 9
    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.minute = 0
    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.hour = 10
    expect(changes).toEqual([{ hour: 9, minute: 0 }, { hour: 10, minute: 0 }])
    time.minute = 30
    expect(changes).toEqual([
        { hour: 9, minute: 0 },
        { hour: 10, minute: 0 },
        { hour: 10, minute: 30 }
    ])

    disposeAutorun()
})

test("computed comparer works with decorate (babel) - 3", () => {
    const sameTime = (from, to) => from.hour === to.hour && from.minute === to.minute
    const time = observable.object(
        {
            hour: 9,
            minute: 0,
            get time() {
                return { hour: this.hour, minute: this.minute }
            }
        },
        {
            time: computed({ equals: sameTime })
        }
    )

    const changes = []
    const disposeAutorun = autorun(() => changes.push(time.time))

    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.hour = 9
    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.minute = 0
    expect(changes).toEqual([{ hour: 9, minute: 0 }])
    time.hour = 10
    expect(changes).toEqual([{ hour: 9, minute: 0 }, { hour: 10, minute: 0 }])
    time.minute = 30
    expect(changes).toEqual([
        { hour: 9, minute: 0 },
        { hour: 10, minute: 0 },
        { hour: 10, minute: 30 }
    ])

    disposeAutorun()
})

test("actions are reassignable", () => {
    // See #1398, make actions reassignable to support stubbing
    class A {
        @action
        m1() {}
        @action m2 = () => {}
        @action.bound
        m3() {}
        @action.bound m4 = () => {}
    }

    const a = new A()
    expect(isAction(a.m1)).toBe(true)
    expect(isAction(a.m2)).toBe(true)
    expect(isAction(a.m3)).toBe(true)
    expect(isAction(a.m4)).toBe(true)
    a.m1 = () => {}
    expect(isAction(a.m1)).toBe(false)
    a.m2 = () => {}
    expect(isAction(a.m2)).toBe(false)
    a.m3 = () => {}
    expect(isAction(a.m3)).toBe(false)
    a.m4 = () => {}
    expect(isAction(a.m4)).toBe(false)
})

test("it should support asyncAction (babel)", async () => {
    const values = []

    mobx.configure({ enforceActions: "observed" })

    class X {
        @observable a = 1

        f = mobx.flow(function* f(initial) {
            this.a = initial // this runs in action
            this.a += yield Promise.resolve(5)
            this.a = this.a * 2
            return this.a
        })
    }

    const x = new X()

    expect(await x.f(3)).toBe(16)
})

test("toJS bug #1413 (babel)", () => {
    class X {
        @observable
        test = {
            test1: 1
        }
    }

    const x = new X()
    const res = mobx.toJS(x.test)
    expect(res).toEqual({ test1: 1 })
    expect(res.__mobxDidRunLazyInitializers).toBe(undefined)
})

test("computed setter problem", () => {
    class Contact {
        @observable firstName = ""
        @observable lastName = ""

        @computed({
            set(value) {
                const [firstName, lastName] = value.split(" ")

                this.firstName = firstName
                this.lastName = lastName
            }
        })
        get fullName() {
            return `${this.firstName} ${this.lastName}`
        }

        set fullName(value) {
            const [firstName, lastName] = value.split(" ")

            this.firstName = firstName
            this.lastName = lastName
        }
    }

    const c = new Contact()

    c.firstName = "Pavan"
    c.lastName = "Podila"

    expect(c.fullName).toBe("Pavan Podila")

    c.fullName = "Michel Weststrate"
    expect(c.firstName).toBe("Michel")
    expect(c.lastName).toBe("Weststrate")
})

test("computed setter problem - 2", () => {
    class Contact {
        @observable firstName = ""
        @observable lastName = ""

        get fullName() {
            return `${this.firstName} ${this.lastName}`
        }
    }

    debugger
    mobx.decorate(Contact, {
        fullName: computed({
            // This doesn't work
            set: function(value) {
                const [firstName, lastName] = value.split(" ")

                this.firstName = firstName
                this.lastName = lastName
            },
            equals: mobx.comparer.identity
        })
    })

    const c = new Contact()

    c.firstName = "Pavan"
    c.lastName = "Podila"

    expect(c.fullName).toBe("Pavan Podila")

    c.fullName = "Michel Weststrate"
    expect(c.firstName).toBe("Michel")
    expect(c.lastName).toBe("Weststrate")
})

test("#1740, combining extendObservable & decorators", () => {
    class AppState {
        constructor(id) {
            extendObservable(this, {
                id
            })
            expect(this.foo).toBe(id)
        }

        @computed
        get foo() {
            return this.id
        }
    }

    let app = new AppState(1)
    expect(app.id).toBe(1)
    expect(app.foo).toBe(1)
    expect(isObservableProp(app, "id")).toBe(true)
    expect(isComputedProp(app, "foo")).toBe(true)

    app = new AppState(2)
    expect(app.id).toBe(2)
    expect(app.foo).toBe(2)
    expect(isObservableProp(app, "id")).toBe(true)
    expect(isComputedProp(app, "foo")).toBe(true)
})
