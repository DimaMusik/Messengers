Name
A unique name for your static site.
Messengers-1

ProjectOptional
Add this static site to a project once it’s created.

Project

Select a project…
Environment

Select an environment…
Branch
The Git branch to build and deploy.
main

Root DirectoryOptional
If set, Render runs commands from this directory instead of the repository root. Additionally, code changes outside of this directory do not trigger an auto-deploy. Most commonly used with a monorepo.
e.g. src
Build Command
Render runs this command to build your app before each deploy.
$
Publish Directory
The relative path of the directory containing built assets to publish. Examples: ./, ./build, dist and frontend/build.
 