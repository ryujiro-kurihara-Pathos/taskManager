import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';
import { SignupComponent } from './signup/signup.component';
import { ProfileComponent } from './profile/profile.component';
import { TaskComponent } from './home/tasks/tasks.component';
import { ProjectComponent } from './home/projects/projects.component';
import { ProjectDetailComponent } from './home/projects/project-detail.component';
import { ProjectListComponent } from './home/projects/project-list.component';
import { InviteResponseComponent } from './home/projects/invite-response.component';

export const routes: Routes = [
  { 
    path: 'home', component: HomeComponent,
    children: [
        { path: '', pathMatch: 'full', redirectTo: 'tasks' },
        { path: 'tasks', component: TaskComponent },
        { path: 'projects', component: ProjectComponent,
          children: [
            { path: '', component: ProjectListComponent },
            { path: ':projectId', component: ProjectDetailComponent },
          ]
         },
    ],
},
  { path: 'signup', component: SignupComponent },
  { path: 'login', component: LoginComponent },
  { path: 'profile', component: ProfileComponent },
  { path: '', redirectTo: 'home', pathMatch: 'full' },

  { path: 'invite-response/:inviteId', component: InviteResponseComponent },
];
