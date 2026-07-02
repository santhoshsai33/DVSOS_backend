const prisma = require('../../config/db');
const { createAuditLog, ensureAuditModule } = require('../../common/utils/audit.util');

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const permissionFields = ['canRead', 'canCreate', 'canUpdate', 'canDelete'];
const PERMISSION_TRANSACTION_OPTIONS = {
  maxWait: 10000,
  timeout: 30000
};

const resolveRoleByIdentifier = async (identifier) => {
  const parsedRoleId = Number(identifier);
  const where = Number.isInteger(parsedRoleId) && parsedRoleId > 0
    ? { id: parsedRoleId }
    : { slug: String(identifier || '').trim() };

  const role = await prisma.role.findUnique({
    where,
    select: {
      id: true,
      name: true,
      slug: true
    }
  });

  if (!role) {
    throw createHttpError(404, 'Role not found');
  }

  return role;
};

const ensureMenusExist = async (menuIds) => {
  const menus = await prisma.menu.findMany({
    where: { id: { in: menuIds } },
    select: { id: true }
  });

  if (menus.length !== menuIds.length) {
    const foundMenuIds = new Set(menus.map((menu) => menu.id));
    const missingMenuIds = menuIds.filter((menuId) => !foundMenuIds.has(menuId));
    throw createHttpError(400, `Invalid menuId values: ${missingMenuIds.join(', ')}`);
  }
};

const getExistingPermissionMap = async (roleId, menuIds) => {
  const permissions = await prisma.roleMenuPermission.findMany({
    where: {
      roleId,
      menuId: { in: menuIds }
    }
  });

  return new Map(permissions.map((permission) => [permission.menuId, permission]));
};

const buildPermissionAuditDetails = (oldPermission, newPermission) => {
  const details = [];

  permissionFields.forEach((fieldName) => {
    const oldValue = oldPermission ? oldPermission[fieldName] : null;
    const newValue = newPermission[fieldName];

    if (oldValue !== newValue) {
      details.push({
        fieldName,
        oldValue,
        newValue,
        dataType: 'boolean'
      });
    }
  });

  if (!oldPermission) {
    details.unshift(
      { fieldName: 'roleId', oldValue: null, newValue: newPermission.roleId, dataType: 'number' },
      { fieldName: 'menuId', oldValue: null, newValue: newPermission.menuId, dataType: 'number' }
    );
  }

  return details;
};

const formatPermissionResponse = (role, menus, permissionMap) => {
  const modules = new Map();

  menus.forEach((menu) => {
    if (!modules.has(menu.module)) {
      modules.set(menu.module, []);
    }

    const permission = permissionMap.get(menu.id);

    modules.get(menu.module).push({
      menuId: menu.id,
      parentId: menu.parentId,
      name: menu.name,
      path: menu.path,
      icon: menu.icon,
      sequence: menu.sequence,
      canRead: permission ? permission.canRead : false,
      canCreate: permission ? permission.canCreate : false,
      canUpdate: permission ? permission.canUpdate : false,
      canDelete: permission ? permission.canDelete : false
    });
  });

  return {
    role,
    modules: Array.from(modules.entries())
      .sort(([moduleA], [moduleB]) => moduleA.localeCompare(moduleB))
      .map(([module, moduleMenus]) => ({
        module,
        menus: moduleMenus.sort((a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name))
      }))
  };
};

const saveRoleMenuPermissions = async (roleId, permissionPayload, actorUserId) => {
  const role = await resolveRoleByIdentifier(roleId);
  const parsedRoleId = role.id;
  const menuIds = permissionPayload.map((permission) => Number(permission.menuId));

  await ensureMenusExist(menuIds);

  const existingPermissionMap = await getExistingPermissionMap(parsedRoleId, menuIds);

  const permissions = await prisma.$transaction(async (tx) => {
    const savedPermissions = [];
    const auditModule = await ensureAuditModule(tx, {
      moduleCode: 'role-management',
      moduleName: 'Role Management'
    });

    for (const permission of permissionPayload) {
      const menuId = Number(permission.menuId);
      const data = {
        roleId: parsedRoleId,
        menuId,
        canRead: permission.canRead,
        canCreate: permission.canCreate,
        canUpdate: permission.canUpdate,
        canDelete: permission.canDelete
      };

      const savedPermission = await tx.roleMenuPermission.upsert({
        where: {
          roleId_menuId: {
            roleId: parsedRoleId,
            menuId
          }
        },
        update: {
          canRead: data.canRead,
          canCreate: data.canCreate,
          canUpdate: data.canUpdate,
          canDelete: data.canDelete
        },
        create: data
      });

      const existingPermission = existingPermissionMap.get(menuId);

      await createAuditLog(tx, {
        tableName: 'role_menu_permissions',
        recordId: savedPermission.id,
        actionType: existingPermission ? 'UPDATE' : 'CREATE',
        performedByUserId: actorUserId,
        recordName: `${role.slug}:${menuId}`,
        comments: existingPermission ? 'Role menu permission updated' : 'Role menu permission created',
        details: buildPermissionAuditDetails(existingPermission, savedPermission),
        moduleId: auditModule.id
      });

      savedPermissions.push(savedPermission);
    }

    return savedPermissions;
  }, PERMISSION_TRANSACTION_OPTIONS);

  return permissions;
};

const getRoleMenuPermissions = async (roleId) => {
  const role = await resolveRoleByIdentifier(roleId);
  const parsedRoleId = role.id;

  const [menus, permissions] = await prisma.$transaction([
    prisma.menu.findMany({
      where: { isActive: true },
      select: {
        id: true,
        module: true,
        parentId: true,
        name: true,
        path: true,
        icon: true,
        sequence: true
      },
      orderBy: [
        { module: 'asc' },
        { sequence: 'asc' },
        { name: 'asc' }
      ]
    }),
    prisma.roleMenuPermission.findMany({
      where: { roleId: parsedRoleId }
    })
  ]);

  const permissionMap = new Map(permissions.map((permission) => [permission.menuId, permission]));

  return formatPermissionResponse(role, menus, permissionMap);
};

const deleteRoleMenuPermission = async (roleId, menuId, actorUserId) => {
  const role = await resolveRoleByIdentifier(roleId);
  const parsedRoleId = role.id;
  const parsedMenuId = Number(menuId);
  await ensureMenusExist([parsedMenuId]);

  const existingPermission = await prisma.roleMenuPermission.findUnique({
    where: {
      roleId_menuId: {
        roleId: parsedRoleId,
        menuId: parsedMenuId
      }
    }
  });

  if (!existingPermission) {
    throw createHttpError(404, 'Role menu permission not found');
  }

  return prisma.$transaction(async (tx) => {
    const deletedPermission = await tx.roleMenuPermission.delete({
      where: {
        roleId_menuId: {
          roleId: parsedRoleId,
          menuId: parsedMenuId
        }
      }
    });

    await createAuditLog(tx, {
      tableName: 'role_menu_permissions',
      recordId: deletedPermission.id,
      actionType: 'DELETE',
      performedByUserId: actorUserId,
      recordName: `${role.slug}:${parsedMenuId}`,
      comments: 'Role menu permission deleted',
      details: permissionFields.map((fieldName) => ({
        fieldName,
        oldValue: deletedPermission[fieldName],
        newValue: null,
        dataType: 'boolean'
      }))
    });

    return deletedPermission;
  });
};

module.exports = {
  saveRoleMenuPermissions,
  getRoleMenuPermissions,
  deleteRoleMenuPermission
};
