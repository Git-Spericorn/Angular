// Angular
import { Component, OnInit, Inject, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
// RxJS
import { Observable, of, Subscription} from 'rxjs';
// Lodash
import { each, find, some } from 'lodash';
// NGRX
import { Update } from '@ngrx/entity';
import { Store, select } from '@ngrx/store';
// State
import { AppState } from '../../../../../core/reducers';
// Services and Models
import {
	Role,
	Permission,
	selectRoleById,
	RoleUpdated,
	selectAllPermissions,
	selectAllRoles,
	selectLastCreatedRoleId,
	RoleOnServerCreated
} from '../../../../../core/auth';
import { delay } from 'rxjs/operators';
import { RolesService } from '../../../../../../app/services/roles.service';
import { LayoutUtilsService, MessageType } from '../../../../../../app/core/_base/crud';

@Component({
	selector: 'kt-role-edit-dialog',
	templateUrl: './role-edit.dialog.component.html',
	changeDetection: ChangeDetectionStrategy.Default,
})
export class RoleEditDialogComponent implements OnInit, OnDestroy {
	
	permissionOfSelectedRole = [];
	role: Role;
	role$: Observable<Role>;
	hasFormErrors: boolean = false;
	viewLoading: boolean = false;
	loadingAfterSubmit: boolean = false;
	allPermissions$: Observable<Permission[]>;
	rolePermissions: Permission[] = [];
	disabled = false;
	private componentSubscriptions: Subscription;

	
	constructor(public dialogRef: MatDialogRef<RoleEditDialogComponent>,
		@Inject(MAT_DIALOG_DATA) public data: any,
		private store: Store<AppState>,
		private rolesService:RolesService,
		private layoutUtilsService:LayoutUtilsService) { }

	ngOnInit() {
		if (this.data.roleId) {
			let payload = {
				role_id: this.data.roleId
			}
			this.getRoleDetails(payload);
		} else {
			const newRole = new Role();
			newRole.clear();
			this.role$ = of(newRole);
			this.getRole();
		}

		
	}

	getRole(){
		this.role$.subscribe(res => {
			if (!res) {
				return;
			}

			this.role = new Role();
			this.role.id = res.id;
			this.role.title = res.title;
			this.role.permissions = res.permissions;
			this.allPermissions$ = this.store.pipe(select(selectAllPermissions));
			// console.log(this.allPermissions$,'permission');
			this.loadPermissions();
		});
	}

	getRoleDetails(payload){
		if(this.rolesService){
			this.rolesService.getRoleByRoleID(payload).subscribe(_response=>{
				// console.log('data details',_response)
				const permissionList = this.setRolePermission(_response);
				let newRole = new Role();
				newRole.id = this.data.roleId;
				newRole.title = _response.rolename;
				newRole.permissions = permissionList;
				if(_response.role_type == 0){
					this.disabled = true;
				}
				this.role = newRole;
				this.role$ = of(newRole);
				this.getRole();
			})
		}
		
	}

	/**
	 * On destroy
	 */
	ngOnDestroy() {
		if (this.componentSubscriptions) {
			this.componentSubscriptions.unsubscribe();
		}
	}

	/**
	 * Load permissions
	 */
	loadPermissions() {
		this.allPermissions$.subscribe(_allPermissions => {
			// console.log(_allPermissions,'permission');
			if (!_allPermissions) {
				return;
			}

			const mainPermissions = _allPermissions.filter(el => !el.parentId);
			mainPermissions.forEach((element: Permission) => {
				const hasUserPermission = this.role.permissions.some(t => t === element.id);
				const rootPermission = new Permission();
				rootPermission.clear();
				rootPermission.isSelected = hasUserPermission;
				rootPermission._children = [];
				rootPermission._grandChildren = [];
				rootPermission.id = element.id;
				rootPermission.level = element.level;
				rootPermission.parentId = element.parentId;
				rootPermission.title = element.title;
				const children = _allPermissions.filter(el => el.parentId && el.parentId === element.id);
				children.forEach(child => {
					const hasUserChildPermission = this.role.permissions.some(t => t === child.id);
					const childPermission = new Permission();
					childPermission.clear();
					childPermission.isSelected = hasUserChildPermission;
					childPermission._children = [];
					childPermission._grandChildren = [];
					childPermission.id = child.id;
					childPermission.level = child.level;
					childPermission.parentId = child.parentId;
					childPermission.title = child.title;
					rootPermission._children.push(childPermission);
					const grandChildren = _allPermissions.filter(el => el.parentId && el.parentId === child.id);
					grandChildren.forEach(grandChild => {
						const hasUserGrandChildPermission = this.role.permissions.some(t => t === grandChild.id);
						const grandChildPermission = new Permission();
						grandChildPermission.clear();
						grandChildPermission.isSelected = hasUserGrandChildPermission;
						grandChildPermission._grandChildren = [];
						grandChildPermission.id = grandChild.id;
						grandChildPermission.level = grandChild.level;
						grandChildPermission.parentId = grandChild.parentId;
						grandChildPermission.title = grandChild.title;
						childPermission._grandChildren.push(grandChildPermission);
					});
				});
				// console.log(rootPermission,'rootPermissionrootPermissionrootPermission')
				this.rolePermissions.push(rootPermission);
			});
		});
	}


	/** ACTIONS */
	/**
	 * Returns permissions ids
	 */
	preparePermissionIds(): number[] {
		const result = [];
		each(this.rolePermissions, (_root: Permission) => {
			if (_root.isSelected) {
				result.push(_root.id);
				each(_root._children, (_child: Permission) => {
					if (_child.isSelected) {
						result.push(_child.id);
						each(_child._grandChildren, (_grantChild: Permission) => {
							if (_grantChild.isSelected) {
								result.push(_grantChild.id);	
							}
						});
					}
				});
			}
		});
		return result;
	}

	/**
	 * Returns role for save
	 */
	prepareRole(): Role {
		const _role = new Role();
		_role.id = this.role.id;
		_role.permissions = this.preparePermissionIds();
		// each(this.assignedRoles, (_role: Role) => _user.roles.push(_role.id));
		_role.title = this.role.title;
		_role.isCoreRole = this.role.isCoreRole;
		return _role;
	}

	/**
	 * Save data
	 */
	onSubmit() {
		this.hasFormErrors = false;
		this.loadingAfterSubmit = false;
		/** check form */
		if (!this.isTitleValid()) {
			this.hasFormErrors = true;
			return;
		}

		const editedRole = this.prepareRole();
		if (editedRole.id > 0) {
			this.updateRole(editedRole);
		} else {
			this.createRole(editedRole);
		}
	}

	/**
	 * Update role
	 *
	 * @param _role: Role
	 */
	updateRole(_role: Role) {
		this.loadingAfterSubmit = true;
		this.viewLoading = true;
		const payload = this.setRole(_role, 'edit');

		this.rolesService.createRole(payload).subscribe(_response=>{
			if(_response.success == 'true'){
				this.viewLoading = false;

				this.dialogRef.close({
					_role,
					isEdit: false
				});
				this.dialogRef.afterClosed().subscribe(_response=>{
					this.layoutUtilsService.showActionNotification('Role has been updated successfully',MessageType.Create);
				})
			}else{
				this.viewLoading = false;
				this.layoutUtilsService.showActionNotification('Error', MessageType.Delete)
			}
		})
	}

	createRole(_role: Role) {
		this.loadingAfterSubmit = true;
		this.viewLoading = true;
		const payload = this.setRole(_role, 'add');
		console.log('permissision', payload);

		this.rolesService.createRole(payload).subscribe(_response=>{
			if(_response.success == 'true'){
				this.viewLoading = false;

				this.dialogRef.close({
					_role,
					isEdit: false
				});
				this.dialogRef.afterClosed().subscribe(_response=>{
					this.layoutUtilsService.showActionNotification('Role has been created successfully',MessageType.Create);
				})
			}else{
				this.viewLoading = false;
				this.layoutUtilsService.showActionNotification('Error', MessageType.Delete)
			}
		})
	}

	onAlertClose($event) {
		this.hasFormErrors = false;
	}

	isSelectedChanged($event, permission: Permission) {
		if (permission._children.length === 0 && permission.isSelected) {
			if(permission._grandChildren.length === 0){
				const _root = find(this.rolePermissions, (item: Permission) => item.id === permission.parentId);
				if (_root && !_root.isSelected) {
					_root.isSelected = true;
				}else{
					each(this.rolePermissions, (item: Permission)=>{
						each(item._children, (childItem: Permission)=>{
							if(childItem.id == permission.parentId){
								item.isSelected = true;
								childItem.isSelected = true;
							}
						})
						
					})
				}
				return;
			}else{
				const _root = find(this.rolePermissions, (item: Permission) => item.id === permission.parentId);
				if (_root && !_root.isSelected) {
					_root.isSelected = true;
				}
				each(permission._grandChildren, (item: Permission) => item.isSelected = true);
				return;
			}
			
		}

		if (permission._children.length === 0 && !permission.isSelected) {
			if(permission._grandChildren.length === 0){
				const _root = find(this.rolePermissions, (item: Permission) => item.id === permission.parentId);
				if (_root && _root.isSelected) {
					if (!some(_root._children, (item: Permission) => item.isSelected === true)) {
						_root.isSelected = false;
					}
				}else{
					each(this.rolePermissions, (item: Permission)=>{
						each(item._children, (childItem: Permission)=>{
							if(childItem.id == permission.parentId){
								if (!some(childItem._grandChildren, (newChildItem: Permission) => newChildItem.isSelected === true)) {
									childItem.isSelected = false;
								}
								
								if (!some(item._children, (newChildItem: Permission) => newChildItem.isSelected === true)) {
									item.isSelected = false;
								}
								
							}
						})
						
					})
				}
				return;
			}else{
				const _root = find(this.rolePermissions, (item: Permission) => item.id === permission.parentId);
				if (_root && _root.isSelected) {
					if (!some(_root._children, (item: Permission) => item.isSelected === true)) {
						_root.isSelected = false;
					}
				}
				each(permission._grandChildren, (item: Permission) => {
					item.isSelected = false;
				});
				return;
				return;
			}
			
		}

		if (permission._children.length > 0 && permission.isSelected) {
			each(permission._children, (item: Permission) => {
				item.isSelected = true;
				if(item._grandChildren.length > 0){
					each(item._grandChildren, (childItem: Permission) => {
						childItem.isSelected = true;
					});
				}
				
			});
			return;
		}

		if (permission._children.length > 0 && !permission.isSelected) {
			each(permission._children, (item: Permission) => {
				item.isSelected = false;
				if(item._grandChildren.length > 0){
					each(item._grandChildren, (childItem: Permission) => {
						childItem.isSelected = false;
					});
				}
			});
			return;
		}

		if (permission._grandChildren.length > 0 && permission.isSelected) {
			const _root = find(this.rolePermissions, (item: Permission) => item.id === permission.parentId);
			if (_root && !_root.isSelected) {
				_root.isSelected = true;
			}
			return;
		}

		if (permission._grandChildren.length > 0 && !permission.isSelected) {
			const _root = find(this.rolePermissions, (item: Permission) => item.id === permission.parentId);
			if (_root && !_root.isSelected) {
				_root.isSelected = true;
			}
			return;
		}

	}

	getTitle(): string {
		if (this.role && this.role.id) {
			// tslint:disable-next-line:no-string-throw
			return `Edit Role -'${this.role.title}'`;
		}

		// tslint:disable-next-line:no-string-throw
		return 'New Role';
	}

	isTitleValid(): boolean {
		return (this.role && this.role.title && this.role.title.length > 0);
	}

	setRolePermission(role){
		this.permissionOfSelectedRole = [];

		if(role.fam_delete || role.fam_write || role.fam_read){
			this.permissionOfSelectedRole.push(2);
			this.permissionOfSelectedRole.push(7);
			if(role.fam_delete){
				this.permissionOfSelectedRole.push(13)
			}
			if(role.fam_write){
				this.permissionOfSelectedRole.push(12)
			}
			if(role.fam_read){
				this.permissionOfSelectedRole.push(11)
			}
		}

		
		
		if(role.org_delete || role.org_read || role.org_write){
			this.permissionOfSelectedRole.push(2);
			this.permissionOfSelectedRole.push(6);
			if(role.org_delete){
				this.permissionOfSelectedRole.push(10)
			}
			if(role.org_write){
				this.permissionOfSelectedRole.push(9)
			}
			if(role.org_read){
				this.permissionOfSelectedRole.push(8)
			}
		}
		
		
		if(role.res_delete || role.res_write || role.res_read){	
			this.permissionOfSelectedRole.push(1);
			if(role.res_delete){
				this.permissionOfSelectedRole.push(5)
			}
			if(role.res_write){
				this.permissionOfSelectedRole.push(4)
			}
			if(role.res_read){
				this.permissionOfSelectedRole.push(3)
			}
		}
		
		if(role.user_manage_write || role.user_manage_delete || role.user_manage_read){	
			this.permissionOfSelectedRole.push(14);
			if(role.user_manage_write){
				this.permissionOfSelectedRole.push(16)
			}
			if(role.user_manage_delete){
				this.permissionOfSelectedRole.push(17)
			}
			if(role.user_manage_read){
				this.permissionOfSelectedRole.push(15)
			}
		}

		return this.permissionOfSelectedRole;
	}

	setRole(_role, argument_method){
		let res_write = "0";
		let res_delete = "0";
		let res_read = "0";
		let org_write = "0";
		let org_read = "0";
		let org_delete = "0";
		let fam_write = "0";
		let fam_read = "0";
		let fam_delete = "0";
		let user_manage_write = "0";
		let user_manage_delete = "0";
		let user_manage_read = "0";
		let method = argument_method;
		let rolename = _role.title
		let roletype = argument_method == 'add' ? '1': null;
		let role_id = _role.id;
		let provider_id = localStorage.getItem('provider_id')
		each(_role.permissions, (permission: number)=>{
			switch(permission){
				case 3: res_read = "1";
						break;
				case 4: res_write = "1";
						break;
				case 5: res_delete = "1";
						break;
				case 8: org_read = "1";
						break;
				case 9: org_write = "1";
						break;
				case 10: org_delete = "1";
						break;
				case 11: fam_read = "1";
						break;
				case 12: fam_write = "1";
						break;
				case 13: fam_delete = "1";
						break;
				case 15: user_manage_read= "1";
						break;
				case 16: user_manage_write= "1";
						break;
				case 17: user_manage_delete = "1";
						break;
			}
		})

		let payload = {
			res_write,
			res_delete,
			res_read,
			org_write,
			org_read,
			org_delete,
			fam_write,
			fam_read,
			fam_delete,
			method,
			rolename,
			roletype,
			role_id,
			provider_id,
			user_manage_read,
			user_manage_write,
			user_manage_delete
		}



		return payload;
	}
}
