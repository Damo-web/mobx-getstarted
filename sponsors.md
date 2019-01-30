# 深入理解 MobX

应流行度的需求（以及为我的孩子们提供一个很酷的故事），这些都是MobX的内部运作方式。很多人都对MobX的一致性和快速性感到惊讶。但请放心，游戏中没有魔力！

首先，让我们定义MobX的核心概念：
- 可观察的状态（Observable state）。任何可以改变且可以作为计算值源的值都是state。 MobX可以使大多数类型的值（基元，数组，类，对象等）和甚至（可能是循环的）引用可以立即观察到。
- 计算值（Computed values）。可以通过使用纯粹对其他可观察值进行操作的函数来计算的任何值。计算值的范围可以从几个字符串的串联到复杂的对象图和可视化的推导。因为计算值本身是可观察的，所以甚至可以从可观察状态导出完整用户界面（UI）的呈现。计算值可能会惰性评估或对状态变化做出反应。
- 反应（Reactions）。反应有点类似于计算值，但不产生新值而产生副作用。Reactions桥接reactive 和命令式编程（imperative programming ），例如打印到控制台，发出网络请求，逐步更新React组件树以修补DOM等。
- 动作（Actions）。Actions是修改状态的主要方法。Actions不是对状态更改的反应，而是采用更改源（如用户事件或传入的Web套接字连接）来修改可观察状态。

计算值和反应都在本博客文章的其余部分中称为推导（derivations）。到目前为止，这可能听起来有点学术性，所以让它具体化吧！在电子表格中，具有值的所有数据单元格将形成可观察状态。公式和图表是可以从数据单元格和其他公式推导的计算值。在屏幕上绘制数据单元格或公式的输出是一种反应。更改数据单元格或公式是一项操作。无论如何，这里有一个使用MobX和React的小例子中的所有四个概念：

```
class Person {
  @observable firstName = "Michel";
  @observable lastName = "Weststrate";
  @observable nickName;

  @computed get fullName() {
    return this.firstName + " " + this.lastName;
  }
}

const michel = new Person();

// Reaction: log the profile info whenever it changes
autorun(() => console.log(person.nickName ? person.nickName : person.fullName));

// Example React component that observes state
const profileView = observer(props => {
  if (props.person.nickName)
    return <div>{props.person.nickName}</div>
  else
    return <div>{props.person.fullName}</div>
});

// Action:
setTimeout(() => michel.nickName = "mweststrate", 5000)

React.render(React.createElement(profileView, { person: michel }), document.body);
// This snippet is runnable in jsfiddle: https://jsfiddle.net/mweststrate/049r6jox/
```
<center>Listing 1: Observable state, computed values, reactive Reactjs component and some actions</center>

据上可绘制如下依赖树：

![](https://user-gold-cdn.xitu.io/2019/1/23/1687ad2373a73486?w=535&h=353&f=png&s=37605)

此应用程序的状态在observable属性（蓝色）中捕获。 可以通过观察firstName和lastName自动从状态推导绿色计算值fullName。 类似地，profileView的呈现可以从nickName和fullName推导。 profileView将通过产生副作用来响应状态更改：它更新React组件树。

使用MobX时，依赖关系树是最小化定义的。 例如，一旦被渲染的人具有nickname，渲染将不再受fullName值的输出影响，也不会影响first-或lastName（参见清单1）。 可以清除这些值之间的所有观察者关系，MobX将相应地自动简化依赖关系树：

![](https://user-gold-cdn.xitu.io/2019/1/23/1687ad2bba8692b8?w=535&h=353&f=png&s=33768)

Figure 2: Dependency tree of the profileView component if the user has a nickname (see listing 1). In contrast to figure 1, fullName is now in lazy mode and does not observe firstName and lastName

MobX将始终尝试最小化生成一致状态所需的计算次数。 在本博文的其余部分，我将介绍用于实现此目标的几种策略。 但在深入了解computed values 和 reactions 如何与状态保持同步之前，让我们首先描述MobX背后的原理：

# 对状态变化做出反应总是比对状态变化起作用更好。

应用程序响应状态更改所采取的任何必要操作通常会创建或更新某些值。 换句话说，大多数操作都管理本地缓存（local cache）。 触发用户界面更新？ 更新聚合值？ 通知后端？ 这些都可以被认为是伪造的缓存失效。 要确保这些缓存保持同步，您需要订阅将来的状态更改，以便再次触发您的操作。

但使用订阅（或游标，镜头，选择器，连接器等）有一个根本问题：随着您的应用程序的发展，您将在管理这些订阅时出错并超额订阅（继续订阅不再使用的值或商店） 在组件中）或取消订阅（忘记监听更新导致微小的陈旧错误）。

换一种说法; 使用手动订阅时，您的应用最终会不一致。

![](https://user-gold-cdn.xitu.io/2019/1/23/1687adaa09d126c5?w=785&h=432&f=png&s=134257)

图3：更新配置文件后的Twitter页面不一致。 固定的推文显示作者姓名和个人资料图片的陈旧值。

上面的图片是Twitter UI不一致的一个很好的例子。正如我的[Reactive2015演讲](https://www.youtube.com/watch?v=FEwLwiizlk0)中所解释的那样，只有两个原因：如果关联作者的配置文件发生了变化，则没有订阅会告诉推文重新呈现。或者数据被规范化，并且推文的作者甚至不涉及当前登录用户的简档，尽管两个数据块都试图描述同一个人的相同属性。

像Flux风格的商店订阅这样的粗粒度订阅非常容易被超额订阅。使用React时，您可以通过打印浪费的渲染来简单地判断您的组件是否超额订阅(oversubscribing)。 MobX会将此数字减少到零。这个想法很简单但违反直觉：订阅越多，重新计算就越少。 MobX为您管理数千名observers。您可以有效地权衡内存的CPU周期。

请注意，超额订阅也以非常微妙的形式存在。如果您订阅了所使用的数据，但并未在所有条件下订阅，那么您仍然需要超额订阅。例如，如果profileView组件订阅具有nickName的人的fullName，则它是超额订阅（参见清单1）。因此MobX设计背后的一个重要原则是：

> 只有在运行时确定订阅时，才能实现最小，一致的订阅集(A minimal, consistent set of subscriptions can only be achieved if subscriptions are determined at run-time)。

MobX背后的第二个重要思想是，对于任何比TodoMVC更复杂的应用程序，您通常需要一个数据图，而不是规范化的树，以便以精神上可管理但最佳的方式存储状态。图形可以实现参照一致性并避免数据重复，从而可以保证推导值永远不会过时。

# MobX如何有效地将所有推导保持在一致状态

解决方案：不要缓存，而是推导(don’t cache, derive instead)。人们问：“这不是非常昂贵吗？”不，它实际上非常有效！原因是，如上所述：MobX不运行所有推导，但确保只有某些reaction中涉及的computed values 与可观察状态保持同步。这些推导被称为reactive。要再次与电子表格绘制并行：只有那些当前可见或由可见公式间接使用的公式需要在其中一个观察到的数据单元发生更改时重新计算。

## Lazy versus reactive评估

那么reaction没有直接或间接使用的计算呢？您仍然可以随时检查计算值的值，如fullName。解决方案很简单：如果计算值不是reactive的，它将按需评估（懒惰），就像普通的getter函数一样。懒惰的推导（从不观察任何东西）如果超出范围，就可以简单地进行垃圾收集。请记住，** 计算值应始终是可观察应用程序状态的纯函数.** 这是原因：对于纯函数而言，它们是懒惰还是同步地评估并不重要;在给定相同的可观察状态的情况下，（纯）函数的评估总是产生相同的结果。

## Running computations

Reactions和computed值都由MobX以相同的方式运行。当重新计算被触发时，函数被推到推导堆栈上（derivation stack）;当前运行的推导的函数堆栈。只要computed正在运行，每个被访问的observable都会将自身注册为推导堆栈最顶层函数的依赖项。如果需要计算值的值，则如果计算值已经处于无功状态，则该值可以简单地是最后已知的值。否则它将推动自己的推导堆栈，切换到reactive模式并开始computing。

![](https://user-gold-cdn.xitu.io/2019/1/23/1687ae942301d500?w=641&h=429&f=png&s=51072)

Figure 4: During the execution of the profileView reaction some observable state and some computed values are being observed. Computed values might recompute, this results in the the dependency tree as shown in figure 1.

计算完成后，它将获得在执行期间访问的可观察列表。 例如，在profileView中，此列表将只包含nickName属性，或者包含nickName和fullName属性。 此列表与先前的可观察列表区分开来。 任何被移除的项都将是未被观察到的（此时计算值可能会从reactive模式返回到lazy模式），并且将观察任何添加的可观察项，直到下一次计算。 当将来更改例如firstname的值时，它知道需要重新计算fullName。 这反过来会导致配置文件视图重新计算。 下一节更详细地解释了这个过程。

![](https://user-gold-cdn.xitu.io/2019/1/23/1687aefcc3f21200?w=435&h=262&f=png&s=26747)

Figure 5: The effects of changing value ‘1’ on the dependency tree. The dashed border indicates the observers that will be marked as stale. Numbers indicate the order of computation.



## 传播状态变化


推导(Derivations)将自动对状态变化做出react。所有reactions同步发生，更重要的是无故障。修改observable值时，将执行以下算法：

observable值向其所有观察者发送过时通知，表明它已变得陈旧。任何受影响的计算值将以递归方式将通知传递给其observer。因此，依赖关系树的一部分将被标记为陈旧。在图5的示例依赖关系树中，当值“1”改变时将变为陈旧的观察者用橙色虚线边框标记。这些都是可能受变化值影响的推导。发送过时通知并存储新值后，将发送就绪通知。此消息还指示值是否确实发生了变化。

一旦推导收到步骤1中收到的每个陈旧通知的就绪通知，它就会知道所有观察到的值都是稳定的并且它将开始重新计算。计算就绪/陈旧消息的数量将确保，例如，计算值'4'将仅在计算值'3'变得稳定之后重新评估。

如果没有任何就绪消息指示值已更改，则推导将简单地告诉其自己的观察者它已再次准备好，但不更改其值。否则，计算将重新计算并向其自己的观察者发送就绪消息。这导致执行顺序如图5所示。注意（例如）最后一个反应（用' - '标记）将永远不会执行，如果计算值'4'重新评估但没有产生新值。

前两段总结了如何在运行时跟踪可观察值和推导之间的依赖关系以及如何通过推导传播更改。此时您可能还会发现反应基本上是一个始终处于反应模式的计算值。重要的是要意识到这个算法可以非常有效地实现而不需要闭包，只需要一堆指针数组。此外，MobX还应用了许多其他优化，这些优化超出了本博文的范围。

## 同步执行

人们常常惊讶于MobX同步运行所有内容（如RxJs且不像knockout）。这有两个很大的优点：首先，它变得根本不可能观察陈旧的推导。因此，在更改影响它的值后，可以立即使用推导值。其次，它使堆栈跟踪和调试更容易，因为它避免了Promise / async库中常见的无用堆栈跟踪。

```
transaction(() => {
  michel.firstName = "Mich";
  michel.lastName = "W.";
});
```
Listing 2: Example transaction. It ensures that nobody is able to observe an intermediate value like “Mich Weststrate”. (See also listing 1)

但是，同步执行还引入了对事务的需求。如果立即连续应用几个突变，则最好在应用所有更改后重新评估所有推导。在事务块中包装操作可实现此目的。事务只是推迟所有就绪通知，直到事务块完成。请注意，事务仍然运行并同步更新所有内容。

这总结了MobX最基本的实现细节。我们还没有涵盖所有内容，但很高兴知道您可以编写计算值。通过组合反应计算，甚至可以将一个数据图自动转换为另一个数据图，并使用最少数量的补丁保持最新的推导。这使得实现复杂模式变得容易，例如map-reduce，使用不可变共享数据的状态跟踪或侧向数据加载。但在下一篇博客文章中更多内容。

# TL; DR：
- 复杂应用程序的应用程序状态最好用图表表示，以实现参照一致性并与问题域的心智模型保持接近。
- 不应该通过使用手动定义的订阅或游标来强制执行状态更改。这将不可避免地导致由于订阅不足或超额订阅而导致的错误。
- 使用运行时分析来确定最小可能的观察者集→可观察的关系。这导致了一种计算模型，其中可以保证在没有观察到陈旧值的情况下运行最小量的推导。
- 任何不需要实现有效副作用的推导都可以完全优化。

有关MobX的更多信息，请查看：

- [My talk at Reactive2015](https://www.youtube.com/watch?v=FEwLwiizlk0)
- [The official website or repo
](http://mweststrate.github.io/mobservable/)
- A boilerplate project: [React + Babel](https://github.com/mweststrate/mobservable-react-boilerplate), [React + TypeScript](https://github.com/mweststrate/mobservable-react-typescript), [TodoMVC](https://github.com/mweststrate/todomvc/tree/master/examples/react-mobservable) or the [Flux-Challenge](https://github.com/staltz/flux-challenge/blob/master/submissions/mweststrate/index.tsx)


原文：[Becoming fully reactive: an in-depth explanation of MobX](https://hackernoon.com/becoming-fully-reactive-an-in-depth-explanation-of-mobservable-55995262a254)