import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-projects',
    templateUrl: './projects.component.html',
    standalone: true,
    imports: [ RouterOutlet ],
})

export class ProjectComponent {
}