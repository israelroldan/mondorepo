---
permalink: "readmore.html"
home_title: Read more
layout: post
---
# The motivation behind <span class="accent">mondorepo</span>

The Node.js package ecosystem has been traditionally developed following the 
*one package per repository* rule, which is a workable solution for 
developing packages that are small in size or complexity and live in 
relative isolation.

As projects' scale increases this approach has a couple significant problems. 

1. The amount of code in a complex project often increases beyond what would 
   ideally live in a single package.
2. Most times, multiple teams of developers need to collaborate on 
   **concurrently developed packages** managed in separate repositories.

## Traditional approaches

Traditional approaches to solve these problems are:

1. Use relative paths all across the project
2. Include jointly developed packages inside the main project's `node_modules` directory.
3. Following the `monorepo` approach (`mono` not `mondo`).

### Using relative paths across a huge codebase

The most common approach to develop a big project is to rely on the usage of relative
paths all across the project's modules.

Inevitably, this means that all modules have a bunch of <code>require</code> statements 
that look like this:

    var myLib = require('../../../lib/my-lib');
    var otherLib = require('../../../lib/other-lib');
    
While this is a common way to approach the problem, it is very difficult to manage because
it requires developers to keep track of these relative paths all across the project.

### Developing from inside `node_modules`
Some projects may choose to jointly develop a private subpackage by placing its sources
directly inside the main project's `node_modules` directory.

An example of this approach would look like the following:

    Repository: 'awesomecorp/MyAwesomeProject'
    MyAwesomeProject/
        index.js                  // <- contains "require('my-pkg')"
        node_modules/
            my-pkg/
               //sources for my-pkg live here and are added to source control

The hypothetical developers of this example chose to jointly develop `my-pkg` and `AwesomePackage`
from the same repository. This is problematic because:

1. `node_modules/my-pkg` had to be force-added to the repository
   (as `node_modules` is usually gitignored)
2. `npm install` needs to be run both in the root of `AwesomePackage` and `node_modules/my-pkg` as part of 
   setting up the project.
3. The removal of the `node_modules` is a common practice as part of a clean build process,
   a developer unfamiliar with the project may inadvertently remove this directory and
   download an outdated copy from the registry, causing all sorts of difficult-to-track-down
   errors.

This approach is clearly problematic, which is why several complex projects follow the
`monorepo` structure (detailed below).

### monolithic repos (monorepos)
Larger projects tend to adopt an approach where multiple packages live inside a
single repository. The most well-known example of such a project is perhaps `Babel`.

The generalization of this approach is often called a `monorepo` (note, no `d` on this
one - `mono` not `mondo`).

Such a project looks like this:

    Repository: 'awesomecorp/MyAwesomeProject'
    MyAwesomeProject/
        MyAwesomeProjectMain/
            index.js                  // <- contains "require('my-pkg')"
        my-pkg/
            //sources for my-pkg live here
        my-other-pkg/
            // sources for my-other-pkg live here

Without the use of external tools, the first problem with this approach is that a `require`
statement would not be able to find any of the subpackages as they're not located inside
the main project's `node_modules` directory. Manual solutions like symlinking them can
provide some aid but they are vulnerable to similar problems as the previous approach.

There are several `npm` packages available that attempt to resolve this problem as well
as provide management for these monorepos. The most widely used is `Lerna`.

Even with the help of a external tool, one of the main downsides of this approach is that
to work on a single package you need to download the whole repository which includes all
other packages. This strongly resembles the old development approach of monolithic 
applications.

## Our approach
While there are potential advantages to each of these approaches, here at Sencha we decided
to tackle the problem in a way that projects remain modular and sub packages can be developed
on their own.

We call these `mondorepos`.

### mondorepos ("`mondo`: large, big")

As an alternative to monolithic repositories, `mondorepo` enables teams to collaborate
 on big complex projects that span across multiple repositories. Each subpackage can be a
 `mondorepo` on its own and so on.
 
An example of this project structure would look like this:

    Repository: 'awesomecorp/MyAwesomeProject'
    MyAwesomeProject/
        index.js
        package.json      // <- contains a reference to "awesomecorp/My-pkg" under "mondo.uses.My-pkg"

    Repository: 'awesomecorp/My-pkg'
    MyAwesomeProject/
        index.js
        package.json
        
Running `mondo install` will connect all used repositories (declared inside `mondo.uses`) and make `My-pkg`
available to be used on a simple `require('My-pkg')` statement, isn't that neat?
  
This effectively means that each subpackage can be developed on its own if needed, but also
can be included as part of any other project that wants to jointly develop a bunch of its own requirements.


## [<span class="accent">❮</span> Back](.)