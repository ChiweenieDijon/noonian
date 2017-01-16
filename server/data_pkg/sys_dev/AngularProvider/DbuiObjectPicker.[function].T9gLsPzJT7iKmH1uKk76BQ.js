function (Dbui, $uibModal, $rootScope) {
  return {
    /**
     *  Use uibModal to show a datatable alowing the selection of one or multiple BO's
     **/
    showPickerDialog: function(boClass, perspectiveName, selectOne, onSelect) {
      Dbui.getPerspective(perspectiveName, boClass, 'picker_list').then(function(perspective) {

        var modalInstance;
        var scope = $rootScope.$new(true);
        scope.title = 'Please select '+boClass+' below';
        scope.boClass = boClass;
        perspective = scope.perspective = _.clone(perspective);

        perspective.recordActions = [{
          label:'select',
          icon:'fa-caret-square-o-right',
          fn: function(args) {
            if(selectOne) modalInstance.close();
            onSelect(args.targetObj);
          }
        }];


        modalInstance = $uibModal.open({
          templateUrl:'dbui/reusable/dialog/datatable_modal.html',
          size:'lg',
          scope: scope
        });
      },
      function(err) {
        alert(err);
      }
      );
    }
  };
}