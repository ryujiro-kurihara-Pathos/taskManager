import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';
import { SignupComponent } from './signup/signup.component';
import { ProfileComponent } from './profile/profile.component';
import { TaskComponent } from './home/tasks/tasks.component';
import { ProjectComponent } from './home/projects/project.component';

export const routes: Routes = [
  { 
    path: 'home', component: HomeComponent,
    children: [
        { path: '', pathMatch: 'full', redirectTo: 'tasks' },
        { path: 'tasks', component: TaskComponent },
        { path: 'projects', component: ProjectComponent },
    ],
},
  { path: 'signup', component: SignupComponent },
  { path: 'login', component: LoginComponent },
  { path: 'profile', component: ProfileComponent },
  { path: '', redirectTo: 'home', pathMatch: 'full' },
];
